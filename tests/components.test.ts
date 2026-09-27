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

expect.extend(axeMatchers)
const opts = { rules: { region: { enabled: false } } }

vi.mock('@meddleware/ui', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    UiDialog: defineComponent({
      props: { open: Boolean, title: String, dismissible: { type: Boolean, default: true }, width: String },
      setup(props, { slots }) {
        return () =>
          props.open
            ? h('dialog', { open: true, 'aria-labelledby': 'dlg-title' }, [
                h('article', [
                  h('header', [h('h2', { id: 'dlg-title' }, props.title)]),
                  slots.default?.(),
                  slots.actions ? h('footer', slots.actions()) : null,
                ]),
              ])
            : null
      },
    }),
    UiStepper: defineComponent({
      props: { steps: Array, modelValue: Number },
      setup(props) {
        return () =>
          h('ol', (props.steps as { id: string; label: string }[]).map((s) => h('li', { key: s.id }, s.label)))
      },
    }),
  }
})

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
  probeRelay: async () => ({ accessible: false, tip: null }),
}))

describe('walrus-relay components (axe)', () => {
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

  it('AccessGateCta (no access, priced) has no violations', async () => {
    const w = mount(AccessGateCta, { props: { gateConfigured: true, hasAccess: false, priceMist: 1_000_000_000n } })
    expect(await axe(w.html(), opts)).toHaveNoViolations()
  })

  it('TipConfigBadge has no violations', async () => {
    const w = mount(TipConfigBadge, { props: { host: 'https://relay.example' } })
    await flushPromises()
    expect(await axe(w.html(), opts)).toHaveNoViolations()
  })
})
