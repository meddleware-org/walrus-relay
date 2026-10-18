import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  parseTipFromConfig,
  parseTipConfig,
  estimateTipMist,
  approxEncodedBytes,
  probeRelay,
  describeTip,
  fetchTipConfig,
  readBoundedJson,
  requireHttpsHost,
  relayOrigin,
  walrusBlobUrl,
  formatCoinAmount,
  formatCoinExact,
  MAX_SINGLE_RESERVATION_EPOCHS,
  MAX_TIP_MIST,
  MAX_TIP_CONFIG_BYTES,
  type WalrusNetwork,
} from '../src/lib/relay.js'

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

const json = (body: unknown, init?: ResponseInit): Response => new Response(JSON.stringify(body), init)

describe('probeRelay', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects when host is not https://', async () => {
    await expect(probeRelay('http://evil.com')).rejects.toThrow('probeRelay')
  })

  it('reports accessible + tip on 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ send_tip: { kind: { const: 42 } } })))
    expect(await probeRelay('https://relay.example')).toEqual({
      accessible: true,
      tip: 42n,
      tipStatus: 'known',
      tipKind: 'const',
    })
  })

  it('reports a genuine no_tip relay as none, not unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json('no_tip')))
    expect(await probeRelay('https://relay.example')).toEqual({
      accessible: true,
      tip: 0n,
      tipStatus: 'none',
      tipKind: 'none',
    })
  })

  it('reports an over-ceiling tip as over-ceiling, not as no tip (F9)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ send_tip: { kind: { const: (MAX_TIP_MIST + 1n).toString() } } })))
    expect(await probeRelay('https://relay.example')).toEqual({
      accessible: true,
      tip: null,
      tipStatus: 'over-ceiling',
      tipKind: 'const',
    })
  })

  it('reports a reachable relay with a malformed or non-JSON tip config as unknown (F9)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ send_tip: { kind: { const: 'many' } } })))
    expect(await probeRelay('https://relay.example')).toMatchObject({ accessible: true, tip: null, tipStatus: 'unknown' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>not json</html>')))
    expect(await probeRelay('https://relay.example')).toMatchObject({ accessible: true, tip: null, tipStatus: 'unknown' })
  })

  it('reports inaccessible on network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom')
      }),
    )
    expect(await probeRelay('https://relay.example')).toEqual({
      accessible: false,
      tip: null,
      tipStatus: 'unknown',
      tipKind: null,
    })
  })

  it('reports inaccessible on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    expect(await probeRelay('https://relay.example')).toMatchObject({ accessible: false, tip: null })
  })

  it('does not double the slash when the host has a trailing slash', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json('no_tip'))
    vi.stubGlobal('fetch', fetchMock)
    await probeRelay('https://relay.example/')
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://relay.example/v1/tip-config')
  })
})

describe('describeTip', () => {
  it('separates none, known, unknown and over-ceiling', () => {
    expect(describeTip(null)).toEqual({ tip: null, status: 'unknown' })
    expect(describeTip({ kind: 'none' })).toEqual({ tip: 0n, status: 'none' })
    expect(describeTip({ kind: 'const', mist: 0n })).toEqual({ tip: 0n, status: 'known' })
    expect(describeTip({ kind: 'const', mist: 5n })).toEqual({ tip: 5n, status: 'known' })
    expect(describeTip({ kind: 'const', mist: MAX_TIP_MIST + 1n })).toEqual({ tip: null, status: 'over-ceiling' })
  })
})

describe('bounded tip-config body (F22, TS-M2)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads a normal body', async () => {
    expect(await readBoundedJson(json({ a: 1 }))).toEqual({ a: 1 })
  })

  it('refuses a body whose declared length is over the cap, without reading it', async () => {
    const res = new Response('{}', { headers: { 'content-length': String(MAX_TIP_CONFIG_BYTES + 1) } })
    await expect(readBoundedJson(res)).rejects.toThrow(/larger than/)
  })

  it('stops reading a streamed body at the cap even when no length is declared', async () => {
    let pulled = 0
    const chunk = new TextEncoder().encode('x'.repeat(4096))
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        controller.enqueue(chunk) // never ends: an endless body
      },
    })
    await expect(readBoundedJson(new Response(stream))).rejects.toThrow(/larger than/)
    // Cap 16 KiB / 4 KiB chunks: a handful of pulls (plus the stream's own read-ahead), not unbounded.
    expect(pulled).toBeLessThan(10)
  })

  it('treats an oversized tip-config as an unknown tip, not an error or a free relay', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(MAX_TIP_CONFIG_BYTES), send_tip: { kind: { const: 1 } } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(big)))
    expect(await fetchTipConfig('https://relay.example')).toEqual({ accessible: true, config: null })
    expect(await probeRelay('https://relay.example')).toMatchObject({ accessible: true, tip: null, tipStatus: 'unknown' })
  })

  it('rejects JSON that is not JSON', async () => {
    await expect(readBoundedJson(new Response('nope'))).rejects.toThrow()
  })
})

describe('host validation (F4, F12)', () => {
  it('allows https and plain http only on loopback', () => {
    expect(() => requireHttpsHost('https://relay.example', 't')).not.toThrow()
    expect(() => requireHttpsHost('http://localhost:3000', 't')).not.toThrow()
    expect(() => requireHttpsHost('http://127.0.0.1:3000', 't')).not.toThrow()
    expect(() => requireHttpsHost('http://[::1]:3000', 't')).not.toThrow()
  })

  it('refuses http on a remote host, a loopback look-alike and non-http schemes', () => {
    expect(() => requireHttpsHost('http://relay.example', 't')).toThrow(/https/)
    expect(() => requireHttpsHost('http://localhost.evil.example', 't')).toThrow(/https/)
    expect(() => requireHttpsHost('ftp://localhost', 't')).toThrow(/https/)
    expect(() => requireHttpsHost('not a url', 't')).toThrow(/invalid URL/)
  })

  it('compares hosts by origin', () => {
    expect(relayOrigin('https://Relay.Example/')).toBe(relayOrigin('https://relay.example'))
    expect(relayOrigin('https://relay.example')).not.toBe(relayOrigin('https://relay.example:8443'))
  })
})

describe('walrusBlobUrl network lookup (F22)', () => {
  it('uses own keys only: a prototype name is an unknown network, not an accident', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(() => walrusBlobUrl(name as unknown as WalrusNetwork, 'abc')).toThrow(/unknown Walrus network/)
    }
  })

  it('does not double the slash for a custom host with a trailing slash', () => {
    expect(walrusBlobUrl('testnet', 'abc', 'https://agg.example/')).toBe('https://agg.example/v1/blobs/abc')
  })
})

describe('formatCoinExact', () => {
  it('writes the amount exactly, with no rounding', () => {
    expect(formatCoinExact(10_000_001n, 'SUI')).toBe('0.010000001 SUI')
    expect(formatCoinExact(10_000_000n, 'SUI')).toBe('0.01 SUI')
    expect(formatCoinExact(1_000_000_000n, 'SUI')).toBe('1 SUI')
    expect(formatCoinExact(0n, 'SUI')).toBe('0 SUI')
    expect(formatCoinExact(18_446_744_073_709_551_615n, 'SUI')).toBe('18446744073.709551615 SUI')
  })
})

describe('constants', () => {
  it('caps epochs at Walrus max_epochs_ahead', () => {
    expect(MAX_SINGLE_RESERVATION_EPOCHS).toBe(53)
  })
})

describe('linear tip schedules', () => {
  const linear = { send_tip: { kind: { linear: { base: 1_000_000, encoded_size_mul_per_kib: 10 } } } }

  it('parses the base and per-KiB multiplier', () => {
    expect(parseTipConfig(linear)).toEqual({ kind: 'linear', base: 1_000_000n, perKib: 10n })
  })

  it('charges base + perKib × floor(encoded bytes / 1024)', () => {
    expect(parseTipFromConfig(linear, 10 * 1024)).toBe(1_000_100n)
    expect(parseTipFromConfig(linear, 1023)).toBe(1_000_000n)
  })

  it('stays under the ceiling at the 100 MiB edge cap', () => {
    const cfg = parseTipConfig(linear)!
    const tip = estimateTipMist(cfg, approxEncodedBytes(100 * 1024 * 1024))
    expect(tip).not.toBeNull()
    expect(tip! < 50_000_000n).toBe(true)
  })

  it('treats no_tip as zero', () => {
    expect(parseTipFromConfig('no_tip')).toBe(0n)
  })
})
