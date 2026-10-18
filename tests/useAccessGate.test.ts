import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accessGateDeployment } from '@meddleware/access-gate-client/deployments'

const fetchAccessNfts = vi.fn()
const buildPurchaseTx = vi.fn()
vi.mock('@meddleware/access-gate-client', async (importActual) => {
  const actual = await importActual<typeof import('@meddleware/access-gate-client')>()
  return {
    ...actual,
    // Ownership is a scripted list; the gate and PlatformConfig reads go through the real parsers.
    fetchAccessNfts: (...args: unknown[]) => fetchAccessNfts(...args),
    buildPurchaseTx: (...args: unknown[]) => {
      buildPurchaseTx(...args)
      return (actual.buildPurchaseTx as (...a: unknown[]) => unknown)(...args)
    },
  }
})

import { useAccessGate, type GateClient, type RelayGateConfig } from '../src/composables/useAccessGate'
import { relayGateConfig } from '../src/constants'

const D = accessGateDeployment('testnet')
const GATE_ID = `0x${'a1'.repeat(32)}`
const OPERATOR = `0x${'0b'.repeat(32)}`
const TREASURY = `0x${'7e'.repeat(32)}`
const gate: RelayGateConfig = relayGateConfig('testnet', { gateId: GATE_ID, soulbound: true })

/** A fake client whose gate and PlatformConfig a test can change, in the shapes a full node renders. */
function fakeChain() {
  const chain = {
    gate: {
      price_mist: '10000000',
      payment_recipient: OPERATOR,
      default_uses: '10',
      soulbound: true,
      auto_burn_at_zero: true,
      paused: false,
      frozen: false,
      nft_name: 'Relay pass',
      nft_image_url: 'https://example.org/pass.png',
      nft_description: 'A pass',
      policy: {
        freeze_requires_unpaused: false,
        lock_commission_on_freeze: false,
        pause_blocks_decryption: false,
        pause_blocks_access: false,
      },
      locked_commission: null,
      free_fee_paid: false,
    } as Record<string, unknown>,
    platform: {
      version: '1',
      treasury: TREASURY,
      commission_bps: '20',
      min_commission_mist: '1000',
      free_gate_fee_mist: '1000000000',
    } as Record<string, unknown>,
    gateType: `${D.originalId}::access_gate::Gate`,
    fail: null as Error | null,
  }
  const getObject = vi.fn(async ({ objectId }: { objectId: string }) => {
    if (chain.fail) throw chain.fail
    if (objectId === GATE_ID) return { object: { objectId, type: chain.gateType, json: chain.gate } }
    if (objectId === D.platformConfigId) {
      return { object: { objectId, type: `${D.originalId}::access_gate::PlatformConfig`, json: chain.platform } }
    }
    throw new Error(`unexpected object ${objectId}`)
  })
  const client = { core: { getObject, listOwnedObjects: vi.fn() } } as unknown as GateClient
  return { chain, client, getObject }
}

function setup(over: { gate?: RelayGateConfig | null } = {}) {
  const fake = fakeChain()
  const getClient = vi.fn<(network: 'testnet' | 'mainnet') => GateClient>(() => fake.client)
  const g = useAccessGate({ network: 'testnet', gate: over.gate === undefined ? gate : over.gate, getClient })
  return { ...fake, getClient, g }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const executor = () => ({
  signAndExecute: vi.fn(async () => ({ digest: 'BUY1' })),
  waitForTransaction: vi.fn(async () => undefined),
})

beforeEach(() => {
  fetchAccessNfts.mockReset()
  buildPurchaseTx.mockReset()
})

describe('useAccessGate pinning to the published deployment (F10)', () => {
  it('refuses a hand-built config that names another package or PlatformConfig', () => {
    const getClient = () => fakeChain().client
    expect(() => useAccessGate({ network: 'testnet', gate: { ...gate, packageId: '0xdead' }, getClient })).toThrow(/package/)
    expect(() => useAccessGate({ network: 'testnet', gate: { ...gate, platformConfigId: '0xbeef' }, getClient })).toThrow(
      /PlatformConfig/,
    )
    expect(() =>
      useAccessGate({ network: 'testnet', gate: { ...gate, nftType: '0xdead::access_gate::SoulboundAccessNFT' }, getClient }),
    ).toThrow(/NFT type/)
  })

  it('refuses a gate on a network with no recorded deployment, but an ungated relay needs none', () => {
    const getClient = () => fakeChain().client
    expect(() => useAccessGate({ network: 'mainnet', gate, getClient })).toThrow(/no access_gate deployment/)
    const open = useAccessGate({ network: 'mainnet', gate: null, getClient })
    expect(open.gateConfigured).toBe(false)
    expect(open.hasAccess.value).toBe(true)
  })

  it('passes the network to getClient', async () => {
    const { g, getClient } = setup()
    fetchAccessNfts.mockResolvedValueOnce([{ objectId: '0xnft', gateId: GATE_ID, variant: { kind: 'unlimited' } }])
    await g.checkOwnership('0xalice')
    expect(getClient).toHaveBeenCalledWith('testnet')
  })
})

describe('useAccessGate wallet switching', () => {
  it('reset() clears access, uses, the held NFT and the terms', async () => {
    const { g } = setup()
    fetchAccessNfts.mockResolvedValueOnce([{ objectId: '0xnft', gateId: GATE_ID, variant: { kind: 'singleUse', remaining: 3n } }])
    await g.checkOwnership('0xalice')
    await g.loadTerms()
    expect(g.hasAccess.value).toBe(true)
    expect(g.terms.value).not.toBeNull()
    g.reset()
    expect(g.hasAccess.value).toBeNull()
    expect(g.nftId.value).toBeNull()
    expect(g.usesRemaining.value).toBeNull()
    expect(g.singleUse.value).toBe(false)
    expect(g.terms.value).toBeNull()
  })

  it('discards an ownership result that arrives after the wallet changed', async () => {
    const { g } = setup()
    const slow = deferred<unknown[]>()
    fetchAccessNfts.mockReturnValueOnce(slow.promise)
    const pending = g.checkOwnership('0xalice')
    g.reset() // wallet disconnected / switched while the check was in flight
    slow.resolve([{ objectId: '0xalice-nft', gateId: GATE_ID, variant: { kind: 'unlimited' } }])
    await pending
    expect(g.hasAccess.value).toBeNull()
    expect(g.nftId.value).toBeNull()
  })

  it('discards terms that arrive after a reset', async () => {
    const { g, getObject } = setup()
    const slow = deferred<unknown>()
    getObject.mockImplementationOnce(() => slow.promise as never)
    const pending = g.loadTerms()
    g.reset()
    slow.resolve({ object: { objectId: GATE_ID, type: `${D.originalId}::access_gate::Gate`, json: {} } })
    expect(await pending).toBeNull()
    expect(g.terms.value).toBeNull()
  })
})

describe('useAccessGate purchase terms (F11)', () => {
  it('reads the price, recipients and fee from the chain, not from configuration', async () => {
    const { g } = setup()
    const t = await g.loadTerms()
    // 10_000_000 MIST at 20 bps = 20_000, above the 1_000 floor.
    expect(t).toEqual({
      network: 'testnet',
      gateId: GATE_ID,
      priceMist: 10_000_000n,
      operator: { address: OPERATOR, mist: 9_980_000n },
      platform: { address: TREASURY, mist: 20_000n },
      paused: false,
      soulbound: true,
      defaultUses: 10n,
    })
    expect(t!.operator.mist + t!.platform.mist).toBe(t!.priceMist)
    expect(g.terms.value).toEqual(t)
    expect(g.termsError.value).toBeNull()
  })

  it('uses the minimum fee when it exceeds the percentage, and the frozen-gate snapshot when there is one', async () => {
    const { g, chain } = setup()
    chain.platform.min_commission_mist = '50000'
    expect((await g.loadTerms())!.platform.mist).toBe(50_000n)
    chain.gate.locked_commission = { bps: '100', min_mist: '0' }
    expect((await g.loadTerms())!.platform.mist).toBe(100_000n)
  })

  it('reads the terms when the check finds no pass, but not when the wallet already holds one', async () => {
    const none = setup()
    fetchAccessNfts.mockResolvedValueOnce([])
    await none.g.checkOwnership('0xalice')
    await vi.waitFor(() => expect(none.g.terms.value).not.toBeNull())

    const has = setup()
    fetchAccessNfts.mockResolvedValueOnce([{ objectId: '0xnft', gateId: GATE_ID, variant: { kind: 'unlimited' } }])
    await has.g.checkOwnership('0xalice')
    expect(has.g.terms.value).toBeNull()
    expect(has.getObject).not.toHaveBeenCalled()
  })

  it('reports why the terms cannot be read', async () => {
    const { g, chain } = setup()
    chain.fail = new Error('rpc down')
    expect(await g.loadTerms()).toBeNull()
    expect(g.termsError.value).toBe('rpc down')
    expect(g.terms.value).toBeNull()
  })

  it('refuses a configured gate that is not a Gate of the published package', async () => {
    const { g, chain } = setup()
    chain.gateType = '0xdead::access_gate::Gate'
    expect(await g.loadTerms()).toBeNull()
    expect(g.termsError.value).toMatch(/is not an access gate of the published testnet deployment/)
  })

  it('refuses a configured pass kind that disagrees with the gate', async () => {
    const { g, chain } = setup()
    chain.gate.soulbound = false
    expect(await g.loadTerms()).toBeNull()
    expect(g.termsError.value).toMatch(/pass kind/)
  })

  it('does not read anything for an ungated relay', async () => {
    const { g, getObject } = setup({ gate: null })
    expect(await g.loadTerms()).toBeNull()
    expect(getObject).not.toHaveBeenCalled()
  })
})

describe('useAccessGate purchase', () => {
  it('never opens the wallet for terms the user has not seen', async () => {
    const { g } = setup()
    fetchAccessNfts.mockResolvedValue([])
    const ex = executor()
    await expect(g.purchase(ex, '0xalice')).rejects.toThrow(/terms have changed/)
    expect(ex.signAndExecute).not.toHaveBeenCalled()
    // The terms were read and published, so the next attempt is against what is now on screen.
    expect(g.terms.value?.priceMist).toBe(10_000_000n)
    expect(g.purchaseError.value).toMatch(/terms have changed/)
  })

  it('builds the purchase from the on-chain price and the shown terms', async () => {
    const { g } = setup()
    fetchAccessNfts.mockResolvedValueOnce([]).mockResolvedValue([{ objectId: '0xnft', gateId: GATE_ID, variant: { kind: 'unlimited' } }])
    await g.loadTerms()
    const ex = executor()
    await g.purchase(ex, '0xalice')
    expect(buildPurchaseTx).toHaveBeenCalledTimes(1)
    expect(buildPurchaseTx).toHaveBeenCalledWith(gate, 10_000_000n)
    expect(ex.signAndExecute).toHaveBeenCalledTimes(1)
    expect(g.hasAccess.value).toBe(true)
    expect(g.purchaseError.value).toBeNull()
  })

  it('stops, and shows the new terms, when the price changed after the terms were shown', async () => {
    const { g, chain } = setup()
    await g.loadTerms()
    chain.gate.price_mist = '20000000' // the operator raised the price
    const ex = executor()
    await expect(g.purchase(ex, '0xalice')).rejects.toThrow(/terms have changed/)
    expect(ex.signAndExecute).not.toHaveBeenCalled()
    expect(g.terms.value?.priceMist).toBe(20_000_000n)

    fetchAccessNfts.mockResolvedValue([{ objectId: '0xnft', gateId: GATE_ID, variant: { kind: 'unlimited' } }])
    await g.purchase(ex, '0xalice')
    expect(buildPurchaseTx).toHaveBeenCalledWith(gate, 20_000_000n)
  })

  it('stops when the recipient or the fee changed, not only the price', async () => {
    const { g, chain } = setup()
    await g.loadTerms()
    chain.gate.payment_recipient = `0x${'cc'.repeat(32)}`
    await expect(g.purchase(executor(), '0xalice')).rejects.toThrow(/terms have changed/)
    await g.loadTerms()
    chain.platform.commission_bps = '100'
    await expect(g.purchase(executor(), '0xalice')).rejects.toThrow(/terms have changed/)
  })

  it('refuses a paused gate before any wallet prompt', async () => {
    const { g, chain } = setup()
    await g.loadTerms()
    chain.gate.paused = true
    const ex = executor()
    await expect(g.purchase(ex, '0xalice')).rejects.toThrow(/paused/)
    expect(ex.signAndExecute).not.toHaveBeenCalled()
    expect(g.terms.value?.paused).toBe(true)
  })

  it('refuses when the price cannot be read, without a wallet prompt', async () => {
    const { g, chain } = setup()
    await g.loadTerms()
    chain.fail = new Error('rpc down')
    const ex = executor()
    await expect(g.purchase(ex, '0xalice')).rejects.toThrow(/Could not read the pass price from the chain: rpc down/)
    expect(ex.signAndExecute).not.toHaveBeenCalled()
  })

  it('reports an access_gate abort in words and leaves other errors alone', async () => {
    const { g } = setup()
    await g.loadTerms()
    const abort = { $kind: 'MoveAbort', MoveAbort: { abortCode: '2', location: { package: D.originalId, module: 'access_gate' } } }
    const aborting = { signAndExecute: vi.fn(async () => { throw abort }), waitForTransaction: vi.fn() }
    await expect(g.purchase(aborting, '0xalice')).rejects.toThrow('The payment is less than the gate price.')
    expect(g.purchaseError.value).toBe('The payment is less than the gate price.')

    const rejected = new Error('User rejected the request')
    const declining = { signAndExecute: vi.fn(async () => { throw rejected }), waitForTransaction: vi.fn() }
    await expect(g.purchase(declining, '0xalice')).rejects.toBe(rejected)
  })

  it('does not claim an abort from another package', async () => {
    const { g } = setup()
    await g.loadTerms()
    const foreign = { $kind: 'MoveAbort', MoveAbort: { abortCode: '2', location: { package: '0xdead', module: 'access_gate' } } }
    const aborting = { signAndExecute: vi.fn(async () => { throw foreign }), waitForTransaction: vi.fn() }
    await expect(g.purchase(aborting, '0xalice')).rejects.toBe(foreign)
  })

  it('never buys a second pass while the first is still being indexed', async () => {
    vi.useFakeTimers()
    try {
      const { g } = setup()
      fetchAccessNfts.mockResolvedValue([]) // the new pass is not visible yet
      await g.loadTerms()
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
      fetchAccessNfts.mockResolvedValue([{ objectId: '0xnft', gateId: GATE_ID, variant: { kind: 'unlimited' } }])
      await g.purchase(ex, '0xalice')
      expect(g.hasAccess.value).toBe(true)
      expect(g.pendingPurchase.value).toBeNull()
      expect(ex.signAndExecute).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries the ownership check while the index catches up, and surfaces the wait error only if it never does', async () => {
    vi.useFakeTimers()
    try {
      const { g } = setup()
      await g.loadTerms()
      const ex = { signAndExecute: vi.fn(async () => ({ digest: 'BUY2' })), waitForTransaction: vi.fn(async () => { throw new Error('wait failed') }) }
      fetchAccessNfts.mockResolvedValue([])
      const attempt = g.purchase(ex, '0xalice')
      const settled = expect(attempt).rejects.toThrow('wait failed')
      await vi.advanceTimersByTimeAsync(20_000)
      await settled
      expect(fetchAccessNfts).toHaveBeenCalledTimes(5)

      // A pass that shows up on the third look wins; the wait error is not thrown.
      const { g: g2 } = setup()
      await g2.loadTerms()
      fetchAccessNfts.mockReset()
      fetchAccessNfts.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValue([{ objectId: '0xnft', gateId: GATE_ID, variant: { kind: 'unlimited' } }])
      const ok = g2.purchase(ex, '0xalice')
      await vi.advanceTimersByTimeAsync(20_000)
      await ok
      expect(g2.hasAccess.value).toBe(true)
      expect(fetchAccessNfts).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a wallet switch clears a pending purchase', async () => {
    vi.useFakeTimers()
    try {
      const { g } = setup()
      fetchAccessNfts.mockResolvedValue([])
      await g.loadTerms()
      const p = g.purchase(executor(), '0xalice')
      await vi.advanceTimersByTimeAsync(10_000)
      await p
      g.reset()
      expect(g.pendingPurchase.value).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses to purchase on an ungated relay', async () => {
    const { g } = setup({ gate: null })
    await expect(g.purchase(executor(), '0xalice')).rejects.toThrow(/No access gate configured/)
  })
})

describe('useAccessGate pass selection', () => {
  const nft = (id: string, variant: unknown) => ({ objectId: id, gateId: GATE_ID, variant })

  it('ignores exhausted receipts, consumes the most-depleted single-use pass first and keeps unlimited last', async () => {
    const { g } = setup()
    fetchAccessNfts.mockResolvedValueOnce([
      nft('0xunl', { kind: 'unlimited' }),
      nft('0xspent', { kind: 'singleUse', remaining: 0n }),
      nft('0xbig', { kind: 'singleUse', remaining: 9n }),
      nft('0xsmall', { kind: 'singleUse', remaining: 2n }),
    ])
    await g.checkOwnership('0xalice')
    expect(g.nftId.value).toBe('0xsmall')
    expect(g.usesRemaining.value).toBe(2n)
    expect(g.singleUse.value).toBe(true)
  })

  it('has no access with only exhausted passes, and an unlimited pass only signs', async () => {
    const { g } = setup()
    fetchAccessNfts.mockResolvedValueOnce([nft('0xspent', { kind: 'singleUse', remaining: 0n })])
    await g.checkOwnership('0xalice')
    expect(g.hasAccess.value).toBe(false)
    fetchAccessNfts.mockResolvedValueOnce([nft('0xunl', { kind: 'unlimited' })])
    await g.checkOwnership('0xalice')
    expect(g.hasAccess.value).toBe(true)
    expect(g.singleUse.value).toBe(false)
    expect(g.usesRemaining.value).toBeNull()
  })

  it('fails closed on a failed ownership check but keeps the purchase path', async () => {
    const { g } = setup()
    fetchAccessNfts.mockRejectedValueOnce(new Error('rpc down'))
    await g.checkOwnership('0xalice')
    expect(g.hasAccess.value).toBe(false)
    expect(g.nftId.value).toBeNull()
    expect(g.error.value).toBe('rpc down')
  })
})
