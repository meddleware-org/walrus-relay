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
