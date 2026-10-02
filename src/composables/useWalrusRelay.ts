import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import {
  approxEncodedBytes,
  estimateTipMist,
  parseTipConfig,
  requireHttpsHost,
  type RelayTipConfig,
} from '../lib/relay.js'

/**
 * The two relay hosts a consumer offers: the operator's own relay (collects the
 * native tip as revenue) and the public Mysten fallback (free, tips Mysten).
 * When `operator === public` there is no operator relay configured.
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
}

/**
 * A Walrus relay option: either the operator's relay or the public Mysten relay.
 * Tracks whether it's accessible and what tip it charges.
 */
export interface RelayOption {
  label: string
  host: string
  tip: bigint | null // null if not accessible
  isPublic: boolean
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
 * Generic over the host pair — the consuming app injects its `WALRUS_RELAY_HOSTS`
 * (operator) + `PUBLIC_WALRUS_RELAY_HOSTS` (public) for the active network.
 */
export function useWalrusRelay(hosts: WalrusRelayHosts, access: RelayAccessOptions = {}) {
  const operatorRelayHost = hosts.operator
  const publicRelayHost = hosts.public
  const isOperatorRelayConfigured = operatorRelayHost !== publicRelayHost
  const gateConfigured = access.gateConfigured ?? false

  // Access is satisfied when there is no gate, or the ownership check confirmed access.
  const accessSatisfied = computed(() => !gateConfigured || access.hasAccess?.value === true)

  const selectedRelayHost = ref(operatorRelayHost)
  const operatorRelayAccessible = ref<boolean | null>(null) // null = checking, true/false = result
  const operatorTipConfig = ref<RelayTipConfig | null>(null)
  /** Base tip (a floor for linear schedules); the size-aware estimate is `estimatedCost`. */
  const operatorRelayTip = computed(() =>
    operatorTipConfig.value ? estimateTipMist(operatorTipConfig.value) : null,
  )
  const fileSizeBytes = ref(0)

  // Health check: can we reach the operator relay's /v1/tip-config?
  const checkOperatorRelayHealth = async (): Promise<void> => {
    if (!isOperatorRelayConfigured) {
      operatorRelayAccessible.value = false
      return
    }
    try {
      requireHttpsHost(operatorRelayHost, 'checkOperatorRelayHealth')
      const res = await fetch(`${operatorRelayHost}/v1/tip-config`, {
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) {
        operatorRelayAccessible.value = true
        try {
          operatorTipConfig.value = parseTipConfig(await res.json())
        } catch {
          // Deliberate: an unparseable tip-config leaves the estimate unknown (display only); the
          // SDK still enforces the client tip ceiling on the real payment.
        }
      } else {
        operatorRelayAccessible.value = false
      }
    } catch {
      operatorRelayAccessible.value = false
    }
  }

  // Relay-selection policy (anti-bypass):
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
    if (isOperatorRelayConfigured && operatorRelayAccessible.value === null) return []
    const operatorUp = isOperatorRelayConfigured && operatorRelayAccessible.value === true

    if (operatorUp) {
      if (!accessSatisfied.value) return []
      return [
        {
          label: 'Operator relay (supports this app)',
          host: operatorRelayHost,
          tip: operatorRelayTip.value,
          isPublic: false,
        },
      ]
    }

    return [
      {
        label: 'Public relay (free, no tip)',
        host: publicRelayHost,
        tip: null,
        isPublic: true,
      },
    ]
  })

  // Show a "purchase access" CTA when the operator relay is live but the connected
  // wallet lacks the required NFT. Always available while the relay is up so a user can buy in.
  const purchaseAccessAvailable = computed(
    () =>
      isOperatorRelayConfigured &&
      operatorRelayAccessible.value === true &&
      gateConfigured &&
      access.hasAccess?.value === false,
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

  // Estimate the cost for the selected relay, based on file size.
  const estimatedCost = computed((): { mist: bigint; sui: string; label: string } | null => {
    if (fileSizeBytes.value === 0) return null

    const relayHost = selectedRelayHost.value
    if (relayHost === publicRelayHost) {
      return { mist: 0n, sui: '0', label: 'Free (public relay)' }
    }

    if (operatorTipConfig.value === null) {
      return null // not yet loaded (or unparseable)
    }

    // Size-aware estimate: a linear schedule is charged on the ENCODED size, approximated here
    // from the raw size (the exact figure is known only after encoding).
    const tipMist = estimateTipMist(operatorTipConfig.value, approxEncodedBytes(fileSizeBytes.value))
    if (tipMist === null) return null // beyond the sanity ceiling — shown as unknown
    const tipSui = Number(tipMist) / 1e9
    return {
      mist: tipMist,
      sui: tipSui.toFixed(6),
      label: `Estimated relay fee: ~${tipSui.toFixed(4)} SUI`,
    }
  })

  /**
   * True while a decision is still pending: the operator health check has not answered, or the
   * relay is up and a configured gate's ownership check has not resolved. Show "checking…"
   * rather than the purchase prompt, and keep uploads blocked.
   */
  const relayPending = computed(
    () =>
      (isOperatorRelayConfigured && operatorRelayAccessible.value === null) ||
      (isOperatorRelayConfigured &&
        operatorRelayAccessible.value === true &&
        gateConfigured &&
        access.hasAccess?.value == null),
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
    checkOperatorRelayHealth,
    ensureValidSelection,
  }
}
