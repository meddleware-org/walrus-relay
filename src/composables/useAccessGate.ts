import { computed, ref } from 'vue'
import type { Transaction } from '@mysten/sui/transactions'
import { fetchAccessNfts, buildPurchaseTx, buildConsumeTx } from '@meddleware/access-gate-client'
import type { AccessGateConfig, OwnedObjectsClient } from '@meddleware/access-gate-client'

export type { AccessGateConfig, OwnedObjectsClient }

/**
 * An access-gate config plus the on-chain purchase price. Build it with `relayGateConfig`, which
 * fixes the package and `PlatformConfig` to Meddleware's deployment; `priceMist` is what
 * {@link buildPurchaseTx} splits from gas.
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
 * Reactive NFT-gate state for the operator relay, built on `@meddleware/access-gate-client`
 * (ownership reads and the purchase/consume transactions).
 *
 * When `gate` is `null` the relay is treated as OPEN (`hasAccess === true`) and the composable
 * is inert. When a gate IS configured, `checkOwnership` decides access and `purchase` buys a
 * pass. Relay access for an upload (consume + signed proof, with resume) is
 * `createGatedAccess` from `@meddleware/walrus-client/flow`, given this composable's
 * `buildConsume`.
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
  /** Bumped on every reset/new check so a response for a previous wallet is discarded. */
  let generation = 0

  /**
   * Forget everything known about the previous wallet (call on disconnect or account switch):
   * access, uses and the held NFT, and invalidate any in-flight ownership check.
   */
  function reset(): void {
    generation++
    hasAccess.value = gateConfigured ? null : true
    usesRemaining.value = null
    nftId.value = null
    error.value = null
    checking.value = false
  }

  /** Query whether `address` holds the gate NFT. Cheap; safe to call on connect. */
  async function checkOwnership(address: string): Promise<void> {
    if (!gate) {
      hasAccess.value = true
      return
    }
    const mine = ++generation
    checking.value = true
    error.value = null
    try {
      const nfts = await fetchAccessNfts(deps.getClient(), address, gate.nftType, gate.gateId)
      if (mine !== generation) return // stale: the wallet changed while this check was in flight
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
      if (mine !== generation) return
      // A failed check must NOT hard-block the user: leave access false but keep the
      // purchase path available (the gateway re-verifies server-side regardless).
      hasAccess.value = false
      nftId.value = null
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (mine === generation) checking.value = false
    }
  }

  /** Purchase access via the connected wallet, then re-check ownership. */
  async function purchase(executor: GateExecutor, address: string): Promise<void> {
    if (!gate) throw new Error('No access gate configured for this network.')
    const tx = buildPurchaseTx(gate, gate.priceMist)
    const res = await executor.signAndExecute(tx)
    let waitError: unknown
    if (res.digest) {
      try {
        await executor.waitForTransaction(res.digest)
      } catch (e) {
        waitError = e // the purchase may still have landed — ownership below decides
      }
    }
    // Sui's owned-object index can lag behind transaction finality by several seconds.
    // Retry until the NFT appears or the retries are exhausted.
    for (let attempt = 0; attempt < 5; attempt++) {
      await checkOwnership(address)
      if (hasAccess.value === true) return
      if (attempt < 4) await new Promise<void>((r) => setTimeout(r, 1500))
    }
    if (waitError) throw waitError
  }

  /** Build the consume PTB for a single-use NFT (woven into the upload flow before proving). */
  function buildConsume(heldNftId: string, nonce: string): Transaction {
    if (!gate) throw new Error('No access gate configured for this network.')
    return buildConsumeTx(gate, heldNftId, nonce)
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
    reset,
    purchase,
    buildConsume,
  }
}
