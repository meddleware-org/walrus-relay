import { computed, ref } from 'vue'
import type { Transaction } from '@mysten/sui/transactions'
import {
  fetchAccessNfts,
  buildPurchaseTx,
  buildConsumeTx,
  fetchChallenge,
  buildAccessProof,
} from '@meddleware/nft-gate-client'
import type {
  AccessGateConfig,
  OwnedObjectsClient,
  PersonalMessageSigner,
} from '@meddleware/nft-gate-client'

export type { AccessGateConfig, OwnedObjectsClient, PersonalMessageSigner }

/**
 * An access-gate config plus the on-chain purchase price. The base
 * {@link AccessGateConfig} (from `@meddleware/nft-gate-client`) identifies the gate +
 * NFT type; `priceMist` is what {@link buildPurchaseTx} splits from gas.
 */
export interface RelayGateConfig extends AccessGateConfig {
  priceMist: bigint | number
}

/**
 * Minimal transaction executor (a structural subset of the app's wallet executor):
 * sign+execute a PTB and optionally wait for finality. Lets this composable stay
 * framework/wallet-agnostic and unit-testable with a fake.
 */
export interface GateExecutor {
  signAndExecute(tx: Transaction): Promise<{ digest?: string }>
  waitForTransaction(digest: string): Promise<unknown>
}

/**
 * Reactive NFT-gate state for the operator relay — generic over the gate config and
 * the Sui client, built on `@meddleware/nft-gate-client` (single source of truth for
 * the ownership/purchase/consume/proof wire format).
 *
 * When `gate` is `null` the relay is treated as OPEN (`hasAccess === true`) and the
 * composable is inert. When a gate IS configured, `checkOwnership` decides access with
 * one `getOwnedObjects` call, and `purchase`/`buildRelayAccessToken` drive buy + prove.
 */
export function useAccessGate(deps: {
  gate: RelayGateConfig | null
  getClient: () => OwnedObjectsClient
}) {
  const gate = deps.gate
  const gateConfigured = gate !== null

  // No gate → open. Gate → unknown until checked.
  const hasAccess = ref<boolean | null>(gateConfigured ? null : true)
  const usesRemaining = ref<number | null>(null)
  /** Object id of the held access NFT (for the single-use consume step); null if none. */
  const nftId = ref<string | null>(null)
  const checking = ref(false)
  const error = ref<string | null>(null)

  /** Query whether `address` holds the gate NFT. Cheap; safe to call on connect. */
  async function checkOwnership(address: string): Promise<void> {
    if (!gate) {
      hasAccess.value = true
      return
    }
    checking.value = true
    error.value = null
    try {
      const nfts = await fetchAccessNfts(deps.getClient(), address, gate.nftType, gate.gateId)
      // Filter out exhausted NFTs (usesRemaining = 0). Unlimited passes have usesRemaining = null.
      // Sort ascending so the most-depleted NFT is consumed first (minimises stranded partial uses).
      // Unlimited passes sort last (treated as Infinity).
      const valid = nfts
        .filter((n) => n.usesRemaining === null || n.usesRemaining > 0)
        .sort((a, b) => {
          const ua = a.usesRemaining ?? Infinity
          const ub = b.usesRemaining ?? Infinity
          return ua - ub
        })
      hasAccess.value = valid.length > 0
      usesRemaining.value = valid.length ? valid[0].usesRemaining : null
      nftId.value = valid.length ? valid[0].objectId : null
    } catch (e) {
      // A failed check must NOT hard-block the user: leave access false but keep the
      // purchase path available (the gateway re-verifies server-side regardless).
      hasAccess.value = false
      nftId.value = null
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      checking.value = false
    }
  }

  /** Purchase access via the connected wallet, then re-check ownership. */
  async function purchase(executor: GateExecutor, address: string): Promise<void> {
    if (!gate) throw new Error('No access gate configured for this network.')
    const tx = buildPurchaseTx(gate, gate.priceMist)
    const res = await executor.signAndExecute(tx)
    if (res.digest) await executor.waitForTransaction(res.digest).catch(() => {})
    // Sui's owned-object index can lag behind transaction finality by several seconds.
    // Retry until the NFT appears or the retries are exhausted.
    for (let attempt = 0; attempt < 5; attempt++) {
      await checkOwnership(address)
      if (hasAccess.value === true) return
      if (attempt < 4) await new Promise<void>((r) => setTimeout(r, 1500))
    }
  }

  /** Build the consume PTB for a single-use NFT (woven into the upload flow before proving). */
  function buildConsume(heldNftId: string, nonce: string): Transaction {
    if (!gate) throw new Error('No access gate configured for this network.')
    return buildConsumeTx(gate, heldNftId, nonce)
  }

  /**
   * Fetch a challenge from the gateway (served at the operator relay host), sign it, and
   * return the base64 access-proof token to pass to the Walrus client as the relay auth
   * token. For single-use gates supply the on-chain consume `consumeDigest`.
   */
  async function buildRelayAccessToken(opts: {
    relayHost: string
    address: string
    sign: PersonalMessageSigner
    consumeDigest?: string
  }): Promise<string> {
    const challenge = await fetchChallenge(opts.relayHost)
    return buildAccessProof({
      address: opts.address,
      challenge,
      sign: opts.sign,
      consumeDigest: opts.consumeDigest,
    })
  }

  /**
   * Full single-use flow: fetch a gateway challenge, execute the on-chain
   * `access_gate::consume` transaction to record the use, then build and return a
   * signed access-proof token with the `consumeDigest`. Required when the gateway
   * operates in SINGLE_USE=true mode — the proof is rejected without a valid
   * on-chain consume event matching the nonce.
   *
   * This triggers one wallet approval (the consume tx). In the Walrus upload flow
   * the caller should invoke this BEFORE `runBlobUpload`, so the token is ready
   * before the relay upload step.
   */
  async function consumeAndBuildToken(opts: {
    relayHost: string
    executor: GateExecutor
    address: string
    sign: PersonalMessageSigner
  }): Promise<string> {
    if (!gate) throw new Error('No access gate configured for this network.')
    const currentNftId = nftId.value
    if (!currentNftId) throw new Error('No access NFT held — purchase one first.')

    // 1. Get a fresh challenge nonce from the gateway.
    const challenge = await fetchChallenge(opts.relayHost)

    // 2. Execute the on-chain consume transaction to record use of this nonce.
    const consumeTx = buildConsumeTx(gate, currentNftId, challenge.nonce)
    const res = await opts.executor.signAndExecute(consumeTx as Transaction)
    if (res.digest) await opts.executor.waitForTransaction(res.digest).catch(() => {})

    // 3. Optimistically update local uses so the UI reflects the spent use immediately
    //    without waiting for a full checkOwnership round-trip.
    if (usesRemaining.value !== null) {
      usesRemaining.value = usesRemaining.value - 1
      if (usesRemaining.value <= 0) {
        hasAccess.value = false
        nftId.value = null
      }
    }

    // 4. Build and return the signed proof that includes the consume tx digest.
    return buildAccessProof({
      address: opts.address,
      challenge,
      sign: opts.sign,
      consumeDigest: res.digest,
    })
  }

  return {
    gate,
    gateConfigured,
    hasAccess,
    usesRemaining,
    nftId,
    checking,
    error,
    /** Convenience: gate configured AND access confirmed. */
    accessGranted: computed(() => !gateConfigured || hasAccess.value === true),
    checkOwnership,
    purchase,
    buildConsume,
    buildRelayAccessToken,
    consumeAndBuildToken,
  }
}
