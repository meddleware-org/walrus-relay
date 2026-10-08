import { describe, expect, it, vi } from 'vitest'

const fetchAccessNfts = vi.fn()
vi.mock('@meddleware/access-gate-client', () => ({
  fetchAccessNfts: (...args: unknown[]) => fetchAccessNfts(...args),
  buildPurchaseTx: vi.fn(),
  buildConsumeTx: vi.fn(),
  isUsablePass: (n: { variant: { kind: string; remaining?: bigint } }) => n.variant.kind === 'unlimited' || (n.variant.remaining ?? 0n) > 0n,
}))

import { useAccessGate } from './useAccessGate'

const gate = {
  packageId: '0xpkg',
  gateId: '0xgate',
  platformConfigId: '0xcfg',
  nftType: '0xpkg::access_gate::SoulboundAccessNFT',
  soulbound: true,
  priceMist: 1n,
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('useAccessGate wallet switching', () => {
  it('reset() clears access, uses and the held NFT', async () => {
    fetchAccessNfts.mockResolvedValueOnce([{ objectId: '0xnft', gateId: '0xgate', variant: { kind: 'singleUse', remaining: 3n } }])
    const g = useAccessGate({ gate: gate as never, getClient: () => ({}) as never })
    await g.checkOwnership('0xalice')
    expect(g.hasAccess.value).toBe(true)
    g.reset()
    expect(g.hasAccess.value).toBeNull()
    expect(g.nftId.value).toBeNull()
    expect(g.usesRemaining.value).toBeNull()
    expect(g.singleUse.value).toBe(false)
  })

  it('discards an ownership result that arrives after the wallet changed', async () => {
    const slow = deferred<unknown[]>()
    fetchAccessNfts.mockReturnValueOnce(slow.promise)
    const g = useAccessGate({ gate: gate as never, getClient: () => ({}) as never })
    const pending = g.checkOwnership('0xalice')
    g.reset() // wallet disconnected / switched while the check was in flight
    slow.resolve([{ objectId: '0xalice-nft', gateId: '0xgate', variant: { kind: 'unlimited' } }])
    await pending
    expect(g.hasAccess.value).toBeNull()
    expect(g.nftId.value).toBeNull()
  })
})

describe('useAccessGate purchase', () => {
  const executor = () => ({
    signAndExecute: vi.fn(async () => ({ digest: 'BUY1' })),
    waitForTransaction: vi.fn(async () => undefined),
  })

  it('never buys a second pass while the first is still being indexed', async () => {
    vi.useFakeTimers()
    try {
      fetchAccessNfts.mockResolvedValue([]) // the new pass is not visible yet
      const g = useAccessGate({ gate: gate as never, getClient: () => ({}) as never })
      const ex = executor()
      const first = g.purchase(ex, '0xalice')
      await vi.advanceTimersByTimeAsync(10_000)
      await first
      expect(ex.signAndExecute).toHaveBeenCalledTimes(1)
      expect(g.pendingPurchase.value?.digest).toBe('BUY1')

      // The user clicks buy again: it re-checks and refuses instead of buying.
      await expect(g.purchase(ex, '0xalice')).rejects.toThrow(/BUY1.*not visible yet/)
      expect(ex.signAndExecute).toHaveBeenCalledTimes(1)

      // Once the pass appears, the pending purchase clears and access is granted.
      fetchAccessNfts.mockResolvedValue([{ objectId: '0xnft', gateId: '0xgate', variant: { kind: 'unlimited' } }])
      await g.purchase(ex, '0xalice')
      expect(g.hasAccess.value).toBe(true)
      expect(g.pendingPurchase.value).toBeNull()
      expect(ex.signAndExecute).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
      fetchAccessNfts.mockReset()
    }
  })

  it('a wallet switch clears a pending purchase', async () => {
    vi.useFakeTimers()
    try {
      fetchAccessNfts.mockResolvedValue([])
      const g = useAccessGate({ gate: gate as never, getClient: () => ({}) as never })
      const p = g.purchase(executor(), '0xalice')
      await vi.advanceTimersByTimeAsync(10_000)
      await p
      g.reset()
      expect(g.pendingPurchase.value).toBeNull()
    } finally {
      vi.useRealTimers()
      fetchAccessNfts.mockReset()
    }
  })
})

describe('useAccessGate pass selection', () => {
  const nft = (id: string, variant: unknown) => ({ objectId: id, gateId: '0xgate', variant })

  it('ignores exhausted receipts, consumes the most-depleted single-use pass first and keeps unlimited last', async () => {
    fetchAccessNfts.mockResolvedValueOnce([
      nft('0xunl', { kind: 'unlimited' }),
      nft('0xspent', { kind: 'singleUse', remaining: 0n }),
      nft('0xbig', { kind: 'singleUse', remaining: 9n }),
      nft('0xsmall', { kind: 'singleUse', remaining: 2n }),
    ])
    const g = useAccessGate({ gate: gate as never, getClient: () => ({}) as never })
    await g.checkOwnership('0xalice')
    expect(g.nftId.value).toBe('0xsmall')
    expect(g.usesRemaining.value).toBe(2n)
    expect(g.singleUse.value).toBe(true)
  })

  it('has no access with only exhausted passes, and an unlimited pass only signs', async () => {
    fetchAccessNfts.mockResolvedValueOnce([nft('0xspent', { kind: 'singleUse', remaining: 0n })])
    const g = useAccessGate({ gate: gate as never, getClient: () => ({}) as never })
    await g.checkOwnership('0xalice')
    expect(g.hasAccess.value).toBe(false)
    fetchAccessNfts.mockResolvedValueOnce([nft('0xunl', { kind: 'unlimited' })])
    await g.checkOwnership('0xalice')
    expect(g.hasAccess.value).toBe(true)
    expect(g.singleUse.value).toBe(false)
    expect(g.usesRemaining.value).toBeNull()
  })
})
