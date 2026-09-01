import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseTipFromConfig, probeRelay, walrusBlobUrl, MAX_SINGLE_RESERVATION_EPOCHS } from './relay.js'

describe('parseTipFromConfig', () => {
  it('reads a flat const tip', () => {
    expect(parseTipFromConfig({ send_tip: { kind: { const: 100000 } } })).toBe(100000n)
  })

  it('reads a linear base tip', () => {
    expect(
      parseTipFromConfig({ send_tip: { kind: { linear: { base: 5000000, encoded_size_mul_per_kib: 5 } } } }),
    ).toBe(5000000n)
  })

  it('returns null when there is no tip', () => {
    expect(parseTipFromConfig({})).toBeNull()
    expect(parseTipFromConfig({ send_tip: {} })).toBeNull()
    expect(parseTipFromConfig(null)).toBeNull()
    expect(parseTipFromConfig({ send_tip: { kind: { linear: {} } } })).toBeNull()
  })

  it('does not throw on garbage', () => {
    expect(parseTipFromConfig({ send_tip: { kind: { const: 'not-a-number' } } })).toBeNull()
  })
})

describe('walrusBlobUrl', () => {
  it('builds an aggregator URL for the network', () => {
    expect(walrusBlobUrl('testnet', 'abc')).toBe(
      'https://aggregator.walrus-testnet.walrus.space/v1/blobs/abc',
    )
  })
  it('honours a custom aggregator host', () => {
    expect(walrusBlobUrl('mainnet', 'xyz', 'https://agg.example')).toBe('https://agg.example/v1/blobs/xyz')
  })
})

describe('probeRelay', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reports accessible + tip on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ send_tip: { kind: { const: 42 } } }) })),
    )
    expect(await probeRelay('https://relay.example')).toEqual({ accessible: true, tip: 42n })
  })

  it('reports inaccessible on network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom')
      }),
    )
    expect(await probeRelay('https://relay.example')).toEqual({ accessible: false, tip: null })
  })

  it('reports inaccessible on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    expect(await probeRelay('https://relay.example')).toEqual({ accessible: false, tip: null })
  })
})

describe('constants', () => {
  it('caps epochs at Walrus max_epochs_ahead', () => {
    expect(MAX_SINGLE_RESERVATION_EPOCHS).toBe(53)
  })
})
