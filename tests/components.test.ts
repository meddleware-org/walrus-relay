// @vitest-environment jsdom
// Accessibility smoke tests for the relay components' rendered markup (axe). Network-facing
// composables are mocked; the shared @meddleware/ui primitives are stubbed because their prebuilt
// dist does not render under these jsdom tests (separate Vue copy) — they are covered by
// @meddleware/ui's own tests.
import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import * as axeMatchers from 'vitest-axe/matchers'
import WalrusUpload from '../src/components/WalrusUpload.vue'
import AccessGateCta from '../src/components/AccessGateCta.vue'
import TipConfigBadge from '../src/components/TipConfigBadge.vue'
import type { PurchaseTerms } from '../src/composables/useAccessGate'

expect.extend(axeMatchers)

const terms: PurchaseTerms = {
  network: 'testnet',
  gateId: `0x${'a1'.repeat(32)}`,
  priceMist: 10_000_000n,
  operator: { address: `0x${'0b'.repeat(32)}`, mist: 9_980_000n },
  platform: { address: `0x${'7e'.repeat(32)}`, mist: 20_000n },
  paused: false,
  soulbound: true,
  defaultUses: 10n,
}

// jsdom has no canvas: axe-core probes getContext() during some checks, and jsdom logs
// "Not implemented" before returning null. Return null up front — the same result axe already
// gets — so the noise goes away without changing what is tested.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
const opts = { rules: { region: { enabled: false } } }

vi.mock('@meddleware/ui', async () => import('./helpers/ui-stubs.js'))

vi.mock('../src/composables/useWalrusRelay.js', async () => {
  const { ref, computed } = await import('vue')
  return {
    useWalrusRelay: () => ({
      selectedRelayHost: ref('https://relay.example'),
      availableRelays: computed(() => [
        { label: 'Public relay', host: 'https://relay.example', tip: null, isPublic: true },
      ]),
      estimatedCost: computed(() => null),
      fileSizeBytes: ref(0),
      checkOperatorRelayHealth: async () => {},
    }),
  }
})

vi.mock('../src/lib/relay.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/relay.js')>()),
  probeRelay: async () => ({ accessible: false, tip: null, tipStatus: 'unknown', tipKind: null }),
}))

describe('walrus-storage-kit components (axe)', () => {
  it('WalrusUpload (initial file step) has no violations', async () => {
    const w = mount(WalrusUpload, {
      props: {
        hosts: { operator: 'https://relay.example', public: 'https://relay.example' },
        connected: true,
        performUpload: async () => {
          throw new Error('not called')
        },
      },
    })
    await flushPromises()
    expect(await axe(w.html(), opts)).toHaveNoViolations()
  })

  it('AccessGateCta (no access, terms read) has no violations', async () => {
    const w = mount(AccessGateCta, { props: { gateConfigured: true, hasAccess: false, terms } })
    expect(await axe(w.html(), opts)).toHaveNoViolations()
  })

  it('AccessGateCta (terms loading, terms error, paused, purchase error) has no violations', async () => {
    for (const props of [
      { terms: null },
      { terms: null, termsError: 'rpc down' },
      { terms: { ...terms, paused: true } },
      { terms, purchaseError: 'The payment is less than the gate price.' },
    ]) {
      const w = mount(AccessGateCta, { props: { gateConfigured: true, hasAccess: false, ...props } })
      expect(await axe(w.html(), opts)).toHaveNoViolations()
    }
  })

  it('TipConfigBadge has no violations', async () => {
    const w = mount(TipConfigBadge, { props: { host: 'https://relay.example' } })
    await flushPromises()
    expect(await axe(w.html(), opts)).toHaveNoViolations()
  })
})
