import type { WalrusNetwork } from './lib/relay.js'

/**
 * Meddleware's deployed `access_gate` package IDs per network.
 * Hardcoded here so any operator wiring up this library automatically uses the
 * canonical package — ensuring the on-chain PlatformConfig commission is enforced.
 */
export const ACCESS_GATE_PACKAGE_ID: Record<WalrusNetwork, string> = {
  testnet: '0x1a81ca177db039585e575beeeee4759466e55910e936a6733e38dbb65025eea4',
  mainnet: '', // populated on mainnet deploy
}

/**
 * Meddleware's `PlatformConfig` shared object IDs per network.
 * This object governs the on-chain commission split on every NFT purchase.
 */
export const ACCESS_GATE_PLATFORM_CONFIG_ID: Record<WalrusNetwork, string> = {
  testnet: '0xe3b949cabe9a0574c03dfc924fb3f96e6f959f2bb86d053ed6229a241c3a23f7',
  mainnet: '', // populated on mainnet deploy
}

/**
 * Return the fully-qualified NFT type string for the given network and soulbound flag.
 * Derived from the hardcoded package ID — no separate env var needed.
 */
export function accessGateNftType(network: WalrusNetwork, soulbound: boolean): string {
  const packageId = ACCESS_GATE_PACKAGE_ID[network]
  if (!packageId) {
    throw new Error(
      `@meddleware/walrus-relay: ACCESS_GATE_PACKAGE_ID is not configured for '${network}'. ` +
        `Deploy access_gate to ${network} and populate constants.ts.`,
    )
  }
  const variant = soulbound ? 'SoulboundAccessNFT' : 'AccessNFT'
  return `${packageId}::access_gate::${variant}`
}
