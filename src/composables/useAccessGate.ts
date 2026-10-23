import { computed, ref } from 'vue'
import type { Transaction } from '@mysten/sui/transactions'
import {
  abortMessage,
  buildConsumeTx,
  buildPurchaseTx,
  fetchAccessNfts,
  fetchGate,
  fetchPlatformConfig,
  gateCommissionMist as gatePlatformShareMist,
  isUsablePass,
} from '@meddleware/access-gate-client'
import type { AccessGateConfig, OwnedObjectsClient, PassVariant, SuiObjectClient } from '@meddleware/access-gate-client'
import { accessGateDeployment } from '@meddleware/access-gate-client/deployments'
import { assertPinnedGate } from '../constants.js'
import type { WalrusNetwork } from '../lib/relay.js'

export type { AccessGateConfig, OwnedObjectsClient, SuiObjectClient }

/** The reads this composable makes: owned objects (passes) and single objects (the gate, the config). */
export type GateClient = OwnedObjectsClient & SuiObjectClient

/**
 * An access-gate config for the relay. Build it with `relayGateConfig`, which fixes the package and
 * `PlatformConfig` to the published deployment; `useAccessGate` refuses any other. The purchase
 * price is read from the gate, not configured.
 */
export interface RelayGateConfig extends AccessGateConfig {
  /** Whether the gate mints soulbound passes (checked against the gate on the chain). */
  soulbound: boolean
}

/**
 * Exactly what a purchase costs and who receives it, read from the gate and the `PlatformConfig` on
 * the chain. This is what the purchase prompt shows before the wallet opens, and what the purchase
 * is built from.
 */
export interface PurchaseTerms {
  network: WalrusNetwork
  gateId: string
  /** The whole payment, MIST (the gate's price). The wallet pays this and nothing more than gas. */
  priceMist: bigint
  /** The gate operator's payment address and its share of the price, MIST. */
  operator: { address: string; mist: bigint }
  /** The platform's payee address (from the PlatformConfig) and its share of the price, MIST. */
  platform: { address: string; mist: bigint }
  /** A paused gate cannot be bought from. */
  paused: boolean
  /** Whether the pass is soulbound (not transferable). */
  soulbound: boolean
  /** Uses on a new pass; `0n` is an unlimited pass. */
  defaultUses: bigint
}

/** True if two reads of the terms are the same, field for field. */
function sameTerms(a: PurchaseTerms, b: PurchaseTerms): boolean {
  return (
    a.gateId === b.gateId &&
    a.priceMist === b.priceMist &&
    a.operator.address === b.operator.address &&
    a.operator.mist === b.operator.mist &&
    a.platform.address === b.platform.address &&
    a.platform.mist === b.platform.mist &&
    a.paused === b.paused &&
    a.soulbound === b.soulbound &&
    a.defaultUses === b.defaultUses
  )
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
 * `createGatedAccess` from `@meddleware/walrus-storage-client/flow`, given this composable's
 * `buildConsume`.
 */
/** How long a submitted-but-not-yet-visible purchase blocks buying again (2 minutes). */
export const PENDING_PURCHASE_MS = 120_000

export function useAccessGate(deps: {
  /** The Walrus network the gate is on; passed to `getClient`, and the deployment `gate` must match. */
  network: WalrusNetwork
  gate: RelayGateConfig | null
  /** The Sui client for `network` (a gRPC client satisfies it). */
  getClient: (network: WalrusNetwork) => GateClient
}) {
  const gate = deps.gate
  const gateConfigured = gate !== null
  // Every transaction built here targets the published deployment: a config that names another
  // package or PlatformConfig is refused up front, whoever built it.
  if (gate) assertPinnedGate(deps.network, gate)
  const originalId = gate ? accessGateDeployment(deps.network).originalId : ''

  // No gate → open. Gate → unknown until checked.
  const hasAccess = ref<boolean | null>(gateConfigured ? null : true)
  /** The held pass's variant (unlimited, or single-use with a remaining count); null if none. */
  const variant = ref<PassVariant | null>(null)
  /** Uses left on a single-use pass (exact, a bigint); null for an unlimited pass or no pass. */
  const usesRemaining = computed(() => (variant.value?.kind === 'singleUse' ? variant.value.remaining : null))
  /** True when the held pass spends one use per upload (an unlimited pass only signs). */
  const singleUse = computed(() => variant.value?.kind === 'singleUse')
  /** Object id of the held access NFT (for the single-use consume step); null if none. */
  const nftId = ref<string | null>(null)
  const checking = ref(false)
  const error = ref<string | null>(null)
  /**
   * A purchase that executed but whose pass is not visible yet (indexing). While it is set,
   * `purchase()` re-checks instead of buying again, so a slow index never costs a second pass.
   */
  const pendingPurchase = ref<{ digest: string; at: number } | null>(null)
  /** Bumped on every reset/new check so a response for a previous wallet is discarded. */
  let generation = 0

  /** The terms last read from the chain (what the purchase prompt shows); null until read. */
  const terms = ref<PurchaseTerms | null>(null)
  const termsLoading = ref(false)
  /** Why the terms could not be read (the purchase stays blocked); null when they could. */
  const termsError = ref<string | null>(null)
  /** Why the last purchase did not complete; null otherwise. */
  const purchaseError = ref<string | null>(null)
  let termsGeneration = 0

  /** Read the gate and the PlatformConfig and derive the terms. Pure: it sets no state. */
  async function readTerms(): Promise<PurchaseTerms> {
    if (!gate) throw new Error('No access gate configured for this network.')
    const client = deps.getClient(deps.network)
    const [onChain, platform] = await Promise.all([
      fetchGate(client, gate.gateId, originalId),
      fetchPlatformConfig(client, gate.platformConfigId, originalId),
    ])
    if (!onChain) throw new Error(`${gate.gateId} is not an access gate of the published ${deps.network} deployment.`)
    if (onChain.soulbound !== gate.soulbound) {
      throw new Error(
        `The configured pass kind (${gate.soulbound ? 'soulbound' : 'transferable'}) does not match the gate on the chain.`,
      )
    }
    const platformMist = gatePlatformShareMist(onChain, platform)
    return {
      network: deps.network,
      gateId: onChain.gateId,
      priceMist: onChain.priceMist,
      operator: { address: onChain.paymentRecipient, mist: onChain.priceMist - platformMist },
      platform: { address: platform.treasury, mist: platformMist },
      paused: onChain.paused,
      soulbound: onChain.soulbound,
      defaultUses: onChain.defaultUses,
    }
  }

  /**
   * Read the purchase terms from the chain and publish them in `terms`. Resolves to the terms, or to
   * `null` when they could not be read (`termsError` says why) or a newer read superseded this one.
   */
  async function loadTerms(): Promise<PurchaseTerms | null> {
    if (!gate) return null
    const mine = ++termsGeneration
    termsLoading.value = true
    try {
      const read = await readTerms()
      if (mine !== termsGeneration) return null
      terms.value = read
      termsError.value = null
      return read
    } catch (e) {
      if (mine !== termsGeneration) return null
      terms.value = null
      termsError.value = e instanceof Error ? e.message : String(e)
      return null
    } finally {
      if (mine === termsGeneration) termsLoading.value = false
    }
  }

  /**
   * Forget everything known about the previous wallet (call on disconnect or account switch):
   * access, uses and the held NFT, and invalidate any in-flight ownership check.
   */
  function reset(): void {
    generation++
    hasAccess.value = gateConfigured ? null : true
    variant.value = null
    nftId.value = null
    error.value = null
    checking.value = false
    pendingPurchase.value = null
    termsGeneration++
    terms.value = null
    termsError.value = null
    termsLoading.value = false
    purchaseError.value = null
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
      const nfts = await fetchAccessNfts(deps.getClient(deps.network), address, gate.nftType, gate.gateId)
      if (mine !== generation) return // stale: the wallet changed while this check was in flight
      // Keep only usable passes (unlimited, or single-use with uses left); an exhausted receipt is
      // not access. Sort so the most-depleted single-use pass is consumed first (minimises stranded
      // partial uses); unlimited passes sort last.
      const remainingOf = (n: (typeof nfts)[number]): bigint | null => (n.variant.kind === 'singleUse' ? n.variant.remaining : null)
      const valid = nfts.filter(isUsablePass).sort((a, b) => {
        const ra = remainingOf(a)
        const rb = remainingOf(b)
        if (ra === rb) return 0
        if (ra === null) return 1
        if (rb === null) return -1
        return ra < rb ? -1 : 1
      })
      const best = valid[0]
      hasAccess.value = best !== undefined
      variant.value = best ? best.variant : null
      nftId.value = best ? best.objectId : null
      if (best) pendingPurchase.value = null
      // No pass: the purchase prompt comes next, so read what it will show now.
      else if (!terms.value && !termsLoading.value) void loadTerms()
    } catch (e) {
      if (mine !== generation) return
      // A failed check must NOT hard-block the user: leave access false but keep the
      // purchase path available (the gateway re-verifies server-side regardless).
      hasAccess.value = false
      nftId.value = null
      error.value = e instanceof Error ? e.message : String(e)
      if (!terms.value && !termsLoading.value) void loadTerms()
    } finally {
      if (mine === generation) checking.value = false
    }
  }

  /**
   * Purchase access via the connected wallet, then re-check ownership.
   *
   * The wallet is asked to sign only for terms the user has seen: the terms are read from the chain
   * right before signing and must equal the `terms` last shown. If they differ (or none were shown
   * yet) the new terms are published in `terms` and this throws, so the user reviews them first.
   * A paused gate is refused before any prompt. An `access_gate` abort is reported in words.
   */
  async function purchase(executor: GateExecutor, address: string): Promise<void> {
    if (!gate) throw new Error('No access gate configured for this network.')
    purchaseError.value = null
    try {
      await runPurchase(gate, executor, address)
    } catch (e) {
      purchaseError.value = e instanceof Error ? e.message : String(e)
      throw e
    }
  }

  async function runPurchase(g: RelayGateConfig, executor: GateExecutor, address: string): Promise<void> {
    const pending = pendingPurchase.value
    if (pending && Date.now() - pending.at < PENDING_PURCHASE_MS) {
      await checkOwnership(address)
      if (hasAccess.value === true) return
      throw new Error(
        `Your purchase (transaction ${pending.digest}) went through but the pass is not visible yet. ` +
          'Check again in a moment instead of buying another pass.',
      )
    }
    const shown = terms.value
    const mine = ++termsGeneration
    let fresh: PurchaseTerms
    try {
      fresh = await readTerms()
    } catch (e) {
      throw new Error(`Could not read the pass price from the chain: ${e instanceof Error ? e.message : String(e)}`, { cause: e })
    }
    if (mine === termsGeneration) {
      terms.value = fresh
      termsError.value = null
    }
    if (fresh.paused) throw new Error('This gate is paused; access cannot be purchased right now.')
    if (!shown || !sameTerms(shown, fresh)) {
      throw new Error('The pass terms have changed. Review the payment and recipients shown, then confirm again.')
    }
    const tx = buildPurchaseTx(g, fresh.priceMist)
    let res: { digest?: string }
    try {
      res = await executor.signAndExecute(tx)
    } catch (e) {
      const message = abortMessage(e, originalId)
      throw message ? new Error(message, { cause: e }) : e
    }
    // The executor throws for a failed transaction, so a digest here means the purchase executed.
    if (res.digest) pendingPurchase.value = { digest: res.digest, at: Date.now() }
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
    singleUse,
    nftId,
    checking,
    error,
    pendingPurchase,
    terms,
    termsLoading,
    termsError,
    purchaseError,
    loadTerms,
    /** Convenience: gate configured AND access confirmed. */
    accessGranted: computed(() => !gateConfigured || hasAccess.value === true),
    checkOwnership,
    reset,
    purchase,
    buildConsume,
  }
}
