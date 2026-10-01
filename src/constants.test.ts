import { describe, it, expect } from 'vitest'
import { accessGateDeployment } from '@meddleware/access-gate-client/deployments'
import { relayGateConfig } from './constants'

describe('relayGateConfig', () => {
  it('pins the package and PlatformConfig to the published deployment', () => {
    const d = accessGateDeployment('testnet')
    const gate = relayGateConfig('testnet', { gateId: '0xgate', soulbound: true, priceMist: 5n })
    expect(gate).toEqual({
      packageId: d.publishedAt,
      platformConfigId: d.platformConfigId,
      nftType: `${d.originalId}::access_gate::SoulboundAccessNFT`,
      gateId: '0xgate',
      soulbound: true,
      priceMist: 5n,
    })
    expect(relayGateConfig('testnet', { gateId: '0xgate', soulbound: false, priceMist: 0 }).nftType).toBe(
      `${d.originalId}::access_gate::AccessNFT`,
    )
  })

  it('refuses a network without a recorded deployment', () => {
    expect(() => relayGateConfig('mainnet', { gateId: '0xgate', soulbound: false, priceMist: 0 })).toThrow(
      /no access_gate deployment recorded for mainnet/,
    )
  })
})
