import { describe, it, expect } from 'vitest'
import { accessGateDeployment } from '@meddleware/access-gate-client/deployments'
import { assertPinnedGate, relayGateConfig } from '../src/constants'

describe('relayGateConfig', () => {
  it('pins the package and PlatformConfig to the published deployment', () => {
    const d = accessGateDeployment('testnet')
    const gate = relayGateConfig('testnet', { gateId: '0xgate', soulbound: true })
    expect(gate).toEqual({
      packageId: d.publishedAt,
      platformConfigId: d.platformConfigId,
      nftType: `${d.originalId}::access_gate::SoulboundAccessNFT`,
      gateId: '0xgate',
      soulbound: true,
    })
    expect(relayGateConfig('testnet', { gateId: '0xgate', soulbound: false }).nftType).toBe(
      `${d.originalId}::access_gate::AccessNFT`,
    )
  })

  it('refuses a network without a recorded deployment', () => {
    expect(() => relayGateConfig('mainnet', { gateId: '0xgate', soulbound: false })).toThrow(
      /no access_gate deployment recorded for mainnet/,
    )
  })

  it('carries no price: it is read from the gate on the chain', () => {
    expect(Object.keys(relayGateConfig('testnet', { gateId: '0xgate', soulbound: true }))).not.toContain('priceMist')
  })
})

describe('assertPinnedGate (F10)', () => {
  const good = () => relayGateConfig('testnet', { gateId: '0xgate', soulbound: true })

  it('accepts what relayGateConfig builds', () => {
    expect(() => assertPinnedGate('testnet', good())).not.toThrow()
    expect(() => assertPinnedGate('testnet', { ...good(), soulbound: false, nftType: relayGateConfig('testnet', { gateId: '0x1', soulbound: false }).nftType })).not.toThrow()
  })

  it('accepts the same ids written without zero padding', () => {
    const d = accessGateDeployment('testnet')
    const short = (id: string) => `0x${id.slice(2).replace(/^0+/, '')}`
    expect(() =>
      assertPinnedGate('testnet', { ...good(), packageId: short(d.publishedAt), platformConfigId: short(d.platformConfigId) }),
    ).not.toThrow()
  })

  it('refuses a foreign package', () => {
    expect(() => assertPinnedGate('testnet', { ...good(), packageId: '0xdead' })).toThrow(/package .* is not the published testnet deployment/)
  })

  it('refuses a foreign PlatformConfig', () => {
    expect(() => assertPinnedGate('testnet', { ...good(), platformConfigId: '0xbeef' })).toThrow(/PlatformConfig/)
  })

  it('refuses an NFT type from another package, another module or another struct', () => {
    const d = accessGateDeployment('testnet')
    expect(() => assertPinnedGate('testnet', { ...good(), nftType: '0xdead::access_gate::SoulboundAccessNFT' })).toThrow(/NFT type/)
    expect(() => assertPinnedGate('testnet', { ...good(), nftType: `${d.originalId}::other::SoulboundAccessNFT` })).toThrow(/not an access NFT type/)
    expect(() => assertPinnedGate('testnet', { ...good(), nftType: `${d.originalId}::access_gate::Gate` })).toThrow(/not an access NFT type/)
  })

  it('refuses an NFT type that disagrees with the soulbound flag', () => {
    expect(() => assertPinnedGate('testnet', { ...good(), soulbound: false })).toThrow(/NFT type/)
  })

  it('refuses a network with no recorded deployment', () => {
    expect(() => assertPinnedGate('mainnet', good())).toThrow(/no access_gate deployment recorded for mainnet/)
  })
})
