// @vitest-environment jsdom
// TipConfigBadge (F9) and AccessGateCta (F11): what the user is told before a payment is approved.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TipConfigBadge from '../src/components/TipConfigBadge.vue'
import AccessGateCta from '../src/components/AccessGateCta.vue'
import { MAX_TIP_MIST } from '../src/lib/relay.js'
import type { PurchaseTerms } from '../src/composables/useAccessGate'

afterEach(() => vi.unstubAllGlobals())

function relay(answer: unknown | number | Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (answer instanceof Error) throw answer
      return typeof answer === 'number' ? new Response('', { status: answer }) : new Response(JSON.stringify(answer))
    }),
  )
}

async function badge(host = 'https://relay.example') {
  const w = mount(TipConfigBadge, { props: { host } })
  await flushPromises()
  return w
}

describe('TipConfigBadge (F9)', () => {
  it('shows "Checking relay…" while the probe is in flight', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const w = mount(TipConfigBadge, { props: { host: 'https://relay.example' } })
    await flushPromises()
    expect(w.text()).toBe('Checking relay…')
    expect(w.attributes('data-state')).toBe('loading')
  })

  it('shows a figure for a known tip, and "from" for a linear schedule', async () => {
    relay({ send_tip: { kind: { const: 100_000 } } })
    expect((await badge()).text()).toBe('● Relay online · tip 0.0001 SUI')
    relay({ send_tip: { kind: { linear: { base: 1_000_000, encoded_size_mul_per_kib: 10 } } } })
    expect((await badge()).text()).toBe('● Relay online · tip from 0.001 SUI')
  })

  it('says "no tip" only for a relay that advertises none', async () => {
    relay('no_tip')
    const w = await badge()
    expect(w.text()).toBe('● Relay online · tip no tip')
    expect(w.attributes('data-tip')).toBe('none')
  })

  it('does not call an over-ceiling tip "no tip"', async () => {
    relay({ send_tip: { kind: { const: (MAX_TIP_MIST + 1n).toString() } } })
    const w = await badge()
    expect(w.text()).toBe('● Relay online · tip above the limit')
    expect(w.text()).not.toContain('no tip')
    expect(w.attributes('data-tip')).toBe('over-ceiling')
  })

  it('does not call an unreadable tip "no tip"', async () => {
    relay({ send_tip: 'garbage' })
    const w = await badge()
    expect(w.text()).toBe('● Relay online · tip unknown')
    expect(w.attributes('data-tip')).toBe('unknown')
  })

  it('shows an unreachable relay', async () => {
    relay(503)
    expect((await badge()).text()).toBe('● Relay unreachable')
    relay(new Error('offline'))
    expect((await badge()).text()).toBe('● Relay unreachable')
  })

  it('shows a configuration error for an invalid host instead of staying on "Checking relay…"', async () => {
    relay('no_tip')
    const w = await badge('http://relay.example')
    expect(w.text()).toBe('● Relay address is not valid')
    expect(w.attributes('data-state')).toBe('invalid')
  })

  it('probes again when the host changes, and ignores an older answer', async () => {
    let release!: (r: Response) => void
    const slow = new Promise<Response>((r) => (release = r))
    const fetchMock = vi.fn((url: string) => (String(url).startsWith('https://old.example') ? slow : Promise.resolve(new Response('"no_tip"'))))
    vi.stubGlobal('fetch', fetchMock)
    const w = mount(TipConfigBadge, { props: { host: 'https://old.example' } })
    await w.setProps({ host: 'https://new.example' })
    await flushPromises()
    expect(w.text()).toBe('● Relay online · tip no tip')
    release(new Response(JSON.stringify({ send_tip: { kind: { const: 5 } } })))
    await flushPromises()
    expect(w.text()).toBe('● Relay online · tip no tip') // the late answer for the old host did not overwrite it
  })
})

const terms: PurchaseTerms = {
  network: 'testnet',
  gateId: `0x${'a1'.repeat(32)}`,
  priceMist: 10_000_001n,
  operator: { address: `0x${'0b'.repeat(32)}`, mist: 9_980_001n },
  platform: { address: `0x${'7e'.repeat(32)}`, mist: 20_000n },
  paused: false,
  soulbound: true,
  defaultUses: 10n,
}

const cta = (props: Record<string, unknown>) =>
  mount(AccessGateCta, { props: { gateConfigured: true, hasAccess: false, terms: null, ...props } })

describe('AccessGateCta (F11)', () => {
  it('is hidden unless a gate is configured and the wallet lacks a pass', () => {
    expect(cta({ gateConfigured: false, terms }).find('.wru-cta').exists()).toBe(false)
    expect(cta({ hasAccess: true, terms }).find('.wru-cta').exists()).toBe(false)
    expect(cta({ hasAccess: null, terms }).find('.wru-cta').exists()).toBe(false)
  })

  it('shows the exact payment, who receives what, the network and the pass before the wallet opens', () => {
    const w = cta({ terms })
    const text = w.text()
    expect(text).toContain('testnet')
    expect(text).toContain('You pay0.010000001 SUI (plus network gas)')
    expect(text).toContain(`Operator receives0.009980001 SUI ${terms.operator.address}`)
    expect(text).toContain(`Platform fee0.00002 SUI ${terms.platform.address}`)
    expect(text).toContain('10 uses, soulbound (cannot be transferred)')
    expect(w.get('button').text()).toBe('Purchase access (0.010000001 SUI)')
    expect(w.get('button').attributes('disabled')).toBeUndefined()
  })

  it('describes an unlimited transferable pass', () => {
    expect(cta({ terms: { ...terms, defaultUses: 0n, soulbound: false } }).text()).toContain('unlimited uses, transferable')
    expect(cta({ terms: { ...terms, defaultUses: 1n } }).text()).toContain('1 use,')
  })

  it('cannot purchase until the terms are read', async () => {
    const w = cta({ terms: null })
    expect(w.text()).toContain('Reading the pass price from the chain…')
    expect(w.get('button').attributes('disabled')).toBeDefined()
    await w.get('button').trigger('click')
    expect(w.emitted('purchase')).toBeUndefined()
  })

  it('cannot purchase when the terms could not be read, and says why', () => {
    const w = cta({ terms: null, termsError: 'rpc down' })
    expect(w.get('[role="alert"]').text()).toContain('rpc down')
    expect(w.get('button').attributes('disabled')).toBeDefined()
  })

  it('blocks a paused gate', async () => {
    const w = cta({ terms: { ...terms, paused: true } })
    expect(w.text()).toContain('paused')
    expect(w.get('button').attributes('disabled')).toBeDefined()
    await w.get('button').trigger('click')
    expect(w.emitted('purchase')).toBeUndefined()
  })

  it('is disabled while a purchase is in flight, and emits once when pressed', async () => {
    const busy = cta({ terms, busy: true })
    expect(busy.get('button').attributes('disabled')).toBeDefined()
    const w = cta({ terms })
    await w.get('button').trigger('click')
    expect(w.emitted('purchase')).toHaveLength(1)
  })

  it('shows why the last purchase failed', () => {
    expect(cta({ terms, purchaseError: 'The payment is less than the gate price.' }).get('[role="alert"]').text()).toBe(
      'The payment is less than the gate price.',
    )
  })
})
