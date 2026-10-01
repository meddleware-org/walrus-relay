import { accessNftType } from '@meddleware/access-gate-client'
import { accessGateDeployment } from '@meddleware/access-gate-client/deployments'
import type { WalrusNetwork } from './lib/relay.js'
import type { RelayGateConfig } from './composables/useAccessGate.js'

/** The operator-chosen part of a relay gate. */
export interface RelayGateInput {
  /** The operator's shared `Gate` object id. */
  gateId: string
  /** Whether the gate mints soulbound passes. */
  soulbound: boolean
  /** The gate's purchase price in MIST. */
  priceMist: bigint | number
}

/**
 * The relay gate config for `network`. The package and `PlatformConfig` are always Meddleware's
 * published deployment (from `@meddleware/access-gate-client/deployments`) and cannot be passed
 * in, so every purchase through this library routes the platform commission to Meddleware's
 * treasury. Calls target the latest package version; the NFT type is at the original id.
 *
 * @throws {Error} if there is no `access_gate` deployment recorded for `network`.
 */
export function relayGateConfig(network: WalrusNetwork, input: RelayGateInput): RelayGateConfig {
  const deployment = accessGateDeployment(network)
  return {
    packageId: deployment.publishedAt,
    platformConfigId: deployment.platformConfigId,
    nftType: accessNftType(deployment.originalId, input.soulbound),
    gateId: input.gateId,
    soulbound: input.soulbound,
    priceMist: input.priceMist,
  }
}
