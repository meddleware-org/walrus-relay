import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import { parseTipFromConfig } from '../lib/relay.js'

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
 * Detects whether the operator relay is accessible (health check on `/v1/tip-config`).
 * If accessible, shows both operator (default) and public relay options. If not,
 * shows only the public relay. Calculates estimated cost based on file size.
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
  const operatorRelayTip = ref<bigint | null>(null)
  const fileSizeBytes = ref(0)

  // Health check: can we reach the operator relay's /v1/tip-config?
  const checkOperatorRelayHealth = async (): Promise<void> => {
    if (!isOperatorRelayConfigured) {
      operatorRelayAccessible.value = false
      return
    }
    try {
      const res = await fetch(`${operatorRelayHost}/v1/tip-config`, {
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) {
        operatorRelayAccessible.value = true
        try {
          operatorRelayTip.value = parseTipFromConfig(await res.json())
        } catch {
          // If we can't parse the tip, that's okay — we'll show "No tip" in the UI
        }
      } else {
        operatorRelayAccessible.value = false
      }
    } catch {
      operatorRelayAccessible.value = false
    }
  }

  // The operator relay is offered only when reachable AND (no gate, or the connected
  // wallet holds the access NFT). Without access we hide the option but still expose the
  // purchase CTA below — the public relay always remains as a fallback.
  const availableRelays = computed((): RelayOption[] => {
    const relays: RelayOption[] = []

    if (isOperatorRelayConfigured && operatorRelayAccessible.value && accessSatisfied.value) {
      relays.push({
        label: 'Operator relay (supports this app)',
        host: operatorRelayHost,
        tip: operatorRelayTip.value,
        isPublic: false,
      })
    }

    relays.push({
      label: 'Public relay (free, no tip)',
      host: publicRelayHost,
      tip: null,
      isPublic: true,
    })

    return relays
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

  // If operator relay is not accessible, force the selection to the public relay.
  const ensureValidSelection = () => {
    const available = availableRelays.value.map((r) => r.host)
    if (!available.includes(selectedRelayHost.value)) {
      selectedRelayHost.value = publicRelayHost
    }
  }

  // Estimate the cost for the selected relay, based on file size.
  const estimatedCost = computed((): { mist: bigint; sui: string; label: string } | null => {
    if (fileSizeBytes.value === 0) return null

    const relayHost = selectedRelayHost.value
    if (relayHost === publicRelayHost) {
      return { mist: 0n, sui: '0', label: 'Free (public relay)' }
    }

    if (operatorRelayTip.value === null) {
      return null // not yet loaded
    }

    // Ballpark: the base (const) or linear base. Exact cost depends on encoding.
    const tipMist = operatorRelayTip.value
    const tipSui = Number(tipMist) / 1e9
    return {
      mist: tipMist,
      sui: tipSui.toFixed(6),
      label: `Estimated relay fee: ${tipSui.toFixed(4)} SUI`,
    }
  })

  return {
    selectedRelayHost,
    operatorRelayAccessible,
    availableRelays,
    purchaseAccessAvailable,
    accessSatisfied,
    fileSizeBytes,
    estimatedCost,
    checkOperatorRelayHealth,
    ensureValidSelection,
  }
}
