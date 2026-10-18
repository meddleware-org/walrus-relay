import { ref, computed, watch, toValue, getCurrentScope, onScopeDispose } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import {
  approxEncodedBytes,
  describeTip,
  estimateTipMist,
  fetchTipConfig,
  relayOrigin,
  requireHttpsHost,
  type RelayTipConfig,
  type TipStatus,
} from '../lib/relay.js'

/**
 * The two relay hosts a consumer offers: the operator's own relay (collects the
 * native tip as revenue) and the public Mysten fallback.
 * When `operator` and `public` are the same origin there is no operator relay configured.
 */
export interface WalrusRelayHosts {
  operator: string
  public: string
}

/** Optional NFT-gate wiring (from `useAccessGate`). Absent ⇒ relay is not NFT-gated. */
export interface RelayAccessOptions {
  /** Whether an access gate is configured for this network. */
  gateConfigured?: boolean
  /** Reactive ownership result: `null` = unknown/checking, `true`/`false` = decided. */
  hasAccess?: Ref<boolean | null>
  /**
   * Whether the held pass spends a use per upload (`useAccessGate().singleUse`). Only used to word
   * the number of wallet approvals an upload needs; absent, the copy gives the range.
   */
  singleUse?: Ref<boolean>
}

/**
 * A Walrus relay option: either the operator's relay or the public Mysten relay.
 * Tracks what tip it charges.
 */
export interface RelayOption {
  label: string
  host: string
  /** Base tip in MIST; `null` unless `tipStatus` is `none` or `known`. */
  tip: bigint | null
  /** Why `tip` is or is not a number (never read an unknown tip as free). */
  tipStatus: TipStatus | 'pending'
  isPublic: boolean
}

/**
 * Delays between re-checks of an operator relay that failed its health check (a transient failure
 * must not hand the free public relay to the user for the rest of the session). After the last
 * delay the result stands until the next `checkOperatorRelayHealth()` call.
 */
export const HEALTH_RECHECK_DELAYS_MS: readonly number[] = [2_000, 5_000, 15_000, 30_000, 60_000]

/** The origin of `host`, or the host itself if it is not a URL (an invalid host is reported by `configError`). */
function originOf(host: string): string {
  try {
    return relayOrigin(host)
  } catch {
    return host
  }
}

/** Throw unless both relay hosts are https (or loopback http); a misconfiguration must be loud. */
function assertRelayHosts(hosts: WalrusRelayHosts): void {
  requireHttpsHost(hosts.operator, 'useWalrusRelay: operator relay host')
  requireHttpsHost(hosts.public, 'useWalrusRelay: public relay host')
}

/**
 * Manage Walrus relay selection and cost estimation.
 *
 * Detects whether the operator relay is accessible (health check on `/v1/tip-config`). While it is
 * up, the operator relay is the only option (and none until a configured gate's pass is
 * confirmed); the public relay is offered only when no operator relay is configured or the check
 * failed. Nothing is offered while the check is pending (`relayPending`). Calculates the estimated
 * cost based on file size.
 *
 * Generic over the host pair — the consuming app injects its operator and public hosts for the
 * active network, as a value, a ref or a getter. A getter or ref is followed: when the hosts change
 * (a network switch) the selection, the tip configs and the health check start over for the new
 * pair. Both hosts are validated up front.
 *
 * @throws {Error} if either initial host is not https (plain http is allowed for loopback only).
 *   A later invalid pair does not throw: it sets `configError` and offers no relay.
 */
export function useWalrusRelay(
  hosts: MaybeRefOrGetter<WalrusRelayHosts>,
  access: MaybeRefOrGetter<RelayAccessOptions> = {},
) {
  const initial = toValue(hosts)
  assertRelayHosts(initial)

  const operatorRelayHost = computed(() => toValue(hosts).operator)
  const publicRelayHost = computed(() => toValue(hosts).public)
  const configError = ref<string | null>(null)
  // Compared by origin, so a trailing slash or a case variant of the same host is the same relay.
  const isOperatorRelayConfigured = computed(
    () => configError.value === null && originOf(operatorRelayHost.value) !== originOf(publicRelayHost.value),
  )
  const gateConfigured = computed(() => toValue(access).gateConfigured ?? false)
  const hasAccessValue = (): boolean | null | undefined => toValue(access).hasAccess?.value

  // Access is satisfied when there is no gate, or the ownership check confirmed access.
  const accessSatisfied = computed(() => !gateConfigured.value || hasAccessValue() === true)

  const selectedRelayHost = ref(initial.operator)
  const operatorRelayAccessible = ref<boolean | null>(null) // null = checking, true/false = result
  const operatorTipConfig = ref<RelayTipConfig | null>(null)
  const publicTipConfig = ref<RelayTipConfig | null>(null)
  /** Per relay: `pending` until probed, then why the tip is or is not known. */
  const operatorTipStatus = ref<TipStatus | 'pending'>('pending')
  const publicTipStatus = ref<TipStatus | 'pending'>('pending')
  /** Base tip (a floor for linear schedules); the size-aware estimate is `estimatedCost`. */
  const operatorRelayTip = computed(() =>
    operatorTipConfig.value ? estimateTipMist(operatorTipConfig.value) : null,
  )
  const publicRelayTip = computed(() => (publicTipConfig.value ? estimateTipMist(publicTipConfig.value) : null))
  const fileSizeBytes = ref(0)

  // ── Health check ────────────────────────────────────────────────────────────
  let healthRequested = false
  let healthGeneration = 0
  let recheckTimer: ReturnType<typeof setTimeout> | null = null

  function clearRecheck(): void {
    if (recheckTimer !== null) clearTimeout(recheckTimer)
    recheckTimer = null
  }

  async function probeOnce(mine: number, attempt: number): Promise<void> {
    const { operator, public: publicHost } = toValue(hosts)
    const operatorPromise = isOperatorRelayConfigured.value ? fetchTipConfig(operator) : null
    // The public relay's tip is read once per check, not assumed to be zero.
    const publicPromise = attempt === 0 ? fetchTipConfig(publicHost) : null
    const [op, pub] = await Promise.all([operatorPromise, publicPromise])
    if (mine !== healthGeneration) return // the hosts changed (or the composable stopped) meanwhile
    if (pub) {
      publicTipConfig.value = pub.config
      publicTipStatus.value = describeTip(pub.config).status
    }
    if (op) {
      operatorRelayAccessible.value = op.accessible
      operatorTipConfig.value = op.config
      operatorTipStatus.value = op.accessible ? describeTip(op.config).status : 'unknown'
    } else {
      operatorRelayAccessible.value = false
    }
    if (op && !op.accessible && attempt < HEALTH_RECHECK_DELAYS_MS.length) {
      recheckTimer = setTimeout(() => {
        recheckTimer = null
        void probeOnce(mine, attempt + 1)
      }, HEALTH_RECHECK_DELAYS_MS[attempt])
    }
  }

  /**
   * Check the operator relay's `/v1/tip-config` (and read the public relay's once). An operator
   * relay that fails is re-checked with backoff ({@link HEALTH_RECHECK_DELAYS_MS}); one that answers
   * is not re-checked, so an outage later keeps it selected and uploads fail closed.
   */
  const checkOperatorRelayHealth = async (): Promise<void> => {
    healthRequested = true
    clearRecheck()
    if (configError.value !== null) return
    await probeOnce(++healthGeneration, 0)
  }

  /** Stop re-checking and discard any in-flight probe (also runs when the owning scope is disposed). */
  function stop(): void {
    healthGeneration++
    clearRecheck()
  }
  if (getCurrentScope()) onScopeDispose(stop)

  // Hosts changed (a network switch without a remount): start over for the new pair.
  watch(
    () => `${operatorRelayHost.value}\n${publicRelayHost.value}`,
    () => {
      stop()
      operatorRelayAccessible.value = null
      operatorTipConfig.value = null
      publicTipConfig.value = null
      operatorTipStatus.value = 'pending'
      publicTipStatus.value = 'pending'
      try {
        assertRelayHosts(toValue(hosts))
        configError.value = null
      } catch (e) {
        configError.value = e instanceof Error ? e.message : String(e)
        return
      }
      selectedRelayHost.value = operatorRelayHost.value
      if (healthRequested) void checkOperatorRelayHealth()
    },
  )

  // Relay-selection policy (anti-bypass):
  //   • hosts invalid                                       ⇒ NO options (a misconfiguration is not
  //     a reason to hand out the free relay).
  //   • operator configured & health check pending          ⇒ NO options yet (the public relay is
  //     not a fallback until the check has actually failed — otherwise an upload started in the
  //     first moments would use the free relay while the operator relay is up).
  //   • operator configured & reachable & access satisfied ⇒ operator relay ONLY (NFT + tip).
  //   • operator configured & reachable & NO access        ⇒ NO options — drive the purchase CTA;
  //     the free public relay is deliberately withheld so users can't dodge the paywall while the
  //     service is up. A gate whose ownership check has not resolved yet also yields no options.
  //   • operator not configured OR unreachable             ⇒ public relay as a genuine fallback.
  // Callers must block uploads while this is empty (see `relayPending` for the waiting state).
  const availableRelays = computed((): RelayOption[] => {
    if (configError.value !== null) return []
    if (isOperatorRelayConfigured.value && operatorRelayAccessible.value === null) return []
    const operatorUp = isOperatorRelayConfigured.value && operatorRelayAccessible.value === true

    if (operatorUp) {
      if (!accessSatisfied.value) return []
      return [
        {
          label: 'Operator relay (supports this app)',
          host: operatorRelayHost.value,
          tip: operatorRelayTip.value,
          tipStatus: operatorTipStatus.value,
          isPublic: false,
        },
      ]
    }

    return [
      {
        label: 'Public relay (fallback)',
        host: publicRelayHost.value,
        tip: publicRelayTip.value,
        tipStatus: publicTipStatus.value,
        isPublic: true,
      },
    ]
  })

  // Show a "purchase access" CTA when the operator relay is live but the connected
  // wallet lacks the required NFT. Always available while the relay is up so a user can buy in.
  const purchaseAccessAvailable = computed(
    () =>
      isOperatorRelayConfigured.value &&
      operatorRelayAccessible.value === true &&
      gateConfigured.value &&
      hasAccessValue() === false,
  )

  // Keep the selected host pointing at a currently-available relay. When the set changes (health
  // check resolves, access is granted/revoked) snap to the first available option. When none are
  // available (gated + unpaid) leave the selection as-is — upload is blocked by the caller.
  const ensureValidSelection = () => {
    const available = availableRelays.value.map((r) => r.host)
    const first = available[0]
    if (first === undefined) return
    if (!available.includes(selectedRelayHost.value)) {
      selectedRelayHost.value = first
    }
  }
  watch(availableRelays, ensureValidSelection, { immediate: true })

  /** True when the selected relay is the public one. */
  const selectedIsPublic = computed(
    () => originOf(selectedRelayHost.value) === originOf(publicRelayHost.value),
  )

  /**
   * The selected relay's tip as the UI must present it for a file of the current size: a figure, no
   * tip, unknown, above the ceiling, or still being read. Never `none` for an unknown tip.
   */
  const relayFeeStatus = computed((): TipStatus | 'pending' => {
    const cfg = selectedIsPublic.value ? publicTipConfig.value : operatorTipConfig.value
    if (cfg === null) return selectedIsPublic.value ? publicTipStatus.value : operatorTipStatus.value
    return describeTip(cfg, approxEncodedBytes(fileSizeBytes.value)).status
  })

  // Estimate the cost for the selected relay, based on file size.
  const estimatedCost = computed((): { mist: bigint; sui: string; label: string } | null => {
    if (fileSizeBytes.value === 0) return null
    const cfg = selectedIsPublic.value ? publicTipConfig.value : operatorTipConfig.value
    if (cfg === null) return null // not yet loaded, or unreadable: shown as unknown (`relayFeeStatus`)

    // Size-aware estimate: a linear schedule is charged on the ENCODED size, approximated here
    // from the raw size (the exact figure is known only after encoding).
    const tipMist = estimateTipMist(cfg, approxEncodedBytes(fileSizeBytes.value))
    if (tipMist === null) return null // beyond the sanity ceiling — shown as unknown
    const tipSui = Number(tipMist) / 1e9
    return {
      mist: tipMist,
      sui: tipSui.toFixed(6),
      label: cfg.kind === 'none' ? 'No relay fee' : `Estimated relay fee: ~${tipSui.toFixed(4)} SUI`,
    }
  })

  /**
   * True while a decision is still pending: the operator health check has not answered, or the
   * relay is up and a configured gate's ownership check has not resolved. Show "checking…"
   * rather than the purchase prompt, and keep uploads blocked.
   */
  const relayPending = computed(
    () =>
      configError.value === null &&
      ((isOperatorRelayConfigured.value && operatorRelayAccessible.value === null) ||
        (isOperatorRelayConfigured.value &&
          operatorRelayAccessible.value === true &&
          gateConfigured.value &&
          hasAccessValue() == null)),
  )

  return {
    selectedRelayHost,
    operatorRelayAccessible,
    relayPending,
    availableRelays,
    purchaseAccessAvailable,
    accessSatisfied,
    fileSizeBytes,
    estimatedCost,
    relayFeeStatus,
    configError,
    checkOperatorRelayHealth,
    ensureValidSelection,
    stop,
  }
}
