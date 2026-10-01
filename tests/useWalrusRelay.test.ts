// Relay-selection policy: no option while the operator health check is pending (no early fallback
// to the free public relay), operator-only once it is up and access is confirmed, nothing while a
// gate's ownership is unknown or unpaid, public only when the operator relay is down or absent.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useWalrusRelay } from '../src/composables/useWalrusRelay.js'

const hosts = { operator: 'https://relay.example.com', public: 'https://public.example.com' }
const tipConfig = { send_tip: { address: '0x1', kind: { const: 1000 } } }

function mockFetch(ok: boolean) {
  vi.stubGlobal('fetch', vi.fn(async () => (ok ? new Response(JSON.stringify(tipConfig)) : new Response('', { status: 503 }))))
}

afterEach(() => vi.unstubAllGlobals())

describe('useWalrusRelay relay selection', () => {
  it('offers nothing while the health check is pending', () => {
    const r = useWalrusRelay(hosts)
    expect(r.availableRelays.value).toEqual([])
    expect(r.relayPending.value).toBe(true)
  })

  it('offers only the operator relay once it is up (ungated)', async () => {
    mockFetch(true)
    const r = useWalrusRelay(hosts)
    await r.checkOperatorRelayHealth()
    await nextTick()
    expect(r.availableRelays.value.map((o) => o.host)).toEqual([hosts.operator])
    expect(r.selectedRelayHost.value).toBe(hosts.operator)
    expect(r.relayPending.value).toBe(false)
  })

  it('falls back to the public relay only after the check fails', async () => {
    mockFetch(false)
    const r = useWalrusRelay(hosts)
    await r.checkOperatorRelayHealth()
    await nextTick()
    expect(r.availableRelays.value.map((o) => o.host)).toEqual([hosts.public])
    expect(r.selectedRelayHost.value).toBe(hosts.public)
  })

  it('withholds every relay while a gate is unresolved or unpaid, then selects the operator', async () => {
    mockFetch(true)
    const hasAccess = ref<boolean | null>(null)
    const r = useWalrusRelay(hosts, { gateConfigured: true, hasAccess })
    await r.checkOperatorRelayHealth()
    await nextTick()
    expect(r.availableRelays.value).toEqual([])
    expect(r.relayPending.value).toBe(true)

    hasAccess.value = false
    await nextTick()
    expect(r.availableRelays.value).toEqual([])
    expect(r.relayPending.value).toBe(false)
    expect(r.purchaseAccessAvailable.value).toBe(true)

    hasAccess.value = true
    await nextTick()
    expect(r.availableRelays.value.map((o) => o.host)).toEqual([hosts.operator])
    expect(r.selectedRelayHost.value).toBe(hosts.operator)
  })

  it('uses the public relay when no operator relay is configured', () => {
    const r = useWalrusRelay({ operator: hosts.public, public: hosts.public })
    expect(r.availableRelays.value.map((o) => o.host)).toEqual([hosts.public])
    expect(r.relayPending.value).toBe(false)
  })
})
