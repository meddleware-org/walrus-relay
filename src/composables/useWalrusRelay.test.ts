import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { useWalrusRelay } from './useWalrusRelay.js'

const OP = 'https://operator.example'
const PUB = 'https://public.example'

describe('useWalrusRelay availableRelays policy (anti-bypass)', () => {
  it('operator up + access satisfied ⇒ operator relay only', async () => {
    const hasAccess = ref<boolean | null>(true)
    const r = useWalrusRelay({ operator: OP, public: PUB }, { gateConfigured: true, hasAccess })
    r.operatorRelayAccessible.value = true
    await nextTick()

    expect(r.availableRelays.value).toHaveLength(1)
    expect(r.availableRelays.value[0]).toMatchObject({ host: OP, isPublic: false })
    expect(r.selectedRelayHost.value).toBe(OP)
  })

  it('operator up + NO access ⇒ no relay available (paywall holds)', () => {
    const hasAccess = ref<boolean | null>(false)
    const r = useWalrusRelay({ operator: OP, public: PUB }, { gateConfigured: true, hasAccess })
    r.operatorRelayAccessible.value = true

    // The free public relay is deliberately withheld so the user can't dodge the paywall.
    expect(r.availableRelays.value).toHaveLength(0)
  })

  it('operator configured but unreachable ⇒ public relay fallback', async () => {
    const hasAccess = ref<boolean | null>(true)
    const r = useWalrusRelay({ operator: OP, public: PUB }, { gateConfigured: true, hasAccess })
    r.operatorRelayAccessible.value = false
    await nextTick()

    expect(r.availableRelays.value).toHaveLength(1)
    expect(r.availableRelays.value[0]).toMatchObject({ host: PUB, isPublic: true })
    expect(r.selectedRelayHost.value).toBe(PUB)
  })

  it('operator not configured (operator === public) ⇒ public only, even if "reachable"', () => {
    const r = useWalrusRelay({ operator: PUB, public: PUB }, {})
    r.operatorRelayAccessible.value = true

    expect(r.availableRelays.value).toHaveLength(1)
    expect(r.availableRelays.value[0].isPublic).toBe(true)
  })

  it('no gate configured ⇒ operator relay offered when reachable', async () => {
    // gateConfigured falsy ⇒ accessSatisfied is true by default.
    const r = useWalrusRelay({ operator: OP, public: PUB }, {})
    r.operatorRelayAccessible.value = true
    await nextTick()

    expect(r.availableRelays.value[0]).toMatchObject({ host: OP, isPublic: false })
    expect(r.selectedRelayHost.value).toBe(OP)
  })
})
