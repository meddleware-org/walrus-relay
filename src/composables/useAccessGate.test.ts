import { describe, expect, it, vi } from 'vitest'

const fetchAccessNfts = vi.fn()
vi.mock('@meddleware/access-gate-client', () => ({
  fetchAccessNfts: (...args: unknown[]) => fetchAccessNfts(...args),
  buildPurchaseTx: vi.fn(),
  buildConsumeTx: vi.fn(),
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
    fetchAccessNfts.mockResolvedValueOnce([{ objectId: '0xnft', gateId: '0xgate', usesRemaining: 3 }])
    const g = useAccessGate({ gate: gate as never, getClient: () => ({}) as never })
    await g.checkOwnership('0xalice')
    expect(g.hasAccess.value).toBe(true)
    g.reset()
    expect(g.hasAccess.value).toBeNull()
    expect(g.nftId.value).toBeNull()
    expect(g.usesRemaining.value).toBeNull()
  })

  it('discards an ownership result that arrives after the wallet changed', async () => {
    const slow = deferred<unknown[]>()
    fetchAccessNfts.mockReturnValueOnce(slow.promise)
    const g = useAccessGate({ gate: gate as never, getClient: () => ({}) as never })
    const pending = g.checkOwnership('0xalice')
    g.reset() // wallet disconnected / switched while the check was in flight
    slow.resolve([{ objectId: '0xalice-nft', gateId: '0xgate', usesRemaining: null }])
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
      fetchAccessNfts.mockResolvedValue([{ objectId: '0xnft', gateId: '0xgate', usesRemaining: null }])
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
