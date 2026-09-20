import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  parseTipFromConfig,
  probeRelay,
  walrusBlobUrl,
  formatCoinAmount,
  MAX_SINGLE_RESERVATION_EPOCHS,
  MAX_TIP_MIST,
} from './relay.js'

describe('formatCoinAmount', () => {
  it('shows 4 decimals for normal amounts', () => {
    expect(formatCoinAmount(13_100_000n, 'WAL')).toBe('0.0131 WAL')
  })
  it('shows a tiny nonzero amount truthfully instead of rounding to 0.0000', () => {
    // 10_000 MIST = 0.00001 SUI — the real relay tip base that was displaying as "0.0000".
    expect(formatCoinAmount(10_000n, 'SUI')).toBe('0.00001 SUI')
  })
  it('renders exact zero plainly', () => {
    expect(formatCoinAmount(0n, 'SUI')).toBe('0 SUI')
  })
})

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

  it('accepts a tip exactly at the ceiling', () => {
    expect(parseTipFromConfig({ send_tip: { kind: { const: MAX_TIP_MIST.toString() } } })).toBe(MAX_TIP_MIST)
  })

  it('clamps an absurdly large tip to null (defense-in-depth)', () => {
    // A malicious relay reporting thousands of SUI — must not surface as an estimate.
    expect(parseTipFromConfig({ send_tip: { kind: { const: (MAX_TIP_MIST + 1n).toString() } } })).toBeNull()
    expect(parseTipFromConfig({ send_tip: { kind: { linear: { base: '1000000000000000000' } } } })).toBeNull()
  })

  it('rejects a negative tip', () => {
    expect(parseTipFromConfig({ send_tip: { kind: { const: -1 } } })).toBeNull()
    expect(parseTipFromConfig({ send_tip: { kind: { linear: { base: -500 } } } })).toBeNull()
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
  it('URL-encodes special characters in the blob id', () => {
    expect(walrusBlobUrl('testnet', 'id with spaces/slash')).toBe(
      'https://aggregator.walrus-testnet.walrus.space/v1/blobs/id%20with%20spaces%2Fslash',
    )
  })
  it('throws when a custom aggregator host is http://', () => {
    expect(() => walrusBlobUrl('testnet', 'abc', 'http://evil.com')).toThrow('walrusBlobUrl')
  })
})

describe('probeRelay', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects when host is not https://', async () => {
    await expect(probeRelay('http://evil.com')).rejects.toThrow('probeRelay')
  })

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
