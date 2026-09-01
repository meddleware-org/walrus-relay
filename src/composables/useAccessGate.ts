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
      hasAccess.value = nfts.length > 0
      usesRemaining.value = nfts.length ? nfts[0].usesRemaining : null
      nftId.value = nfts.length ? nfts[0].objectId : null
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
    await checkOwnership(address)
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
  }
}
