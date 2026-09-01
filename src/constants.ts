import type { WalrusNetwork } from './lib/relay.js'

/**
 * Meddleware's deployed `access_gate` package IDs per network.
 * Hardcoded here so any operator wiring up this library automatically uses the
 * canonical package — ensuring the on-chain PlatformConfig commission is enforced.
 */
export const ACCESS_GATE_PACKAGE_ID: Record<WalrusNetwork, string> = {
  testnet: '0x0bedd0b27d993d3292ca6a5315f7562de8bc0ff3752b445b4c53252c76f2d20d',
  mainnet: '', // populated on mainnet deploy
}

/**
 * Meddleware's `PlatformConfig` shared object IDs per network.
 * This object governs the on-chain commission split on every NFT purchase.
 */
export const ACCESS_GATE_PLATFORM_CONFIG_ID: Record<WalrusNetwork, string> = {
  testnet: '0x7c5aed0ce7f29a4dfb60657858df31c12410a67098b4bcdd1d8cb1e531be4884',
  mainnet: '', // populated on mainnet deploy
}

/**
 * Return the fully-qualified NFT type string for the given network and soulbound flag.
 * Derived from the hardcoded package ID — no separate env var needed.
 */
export function accessGateNftType(network: WalrusNetwork, soulbound: boolean): string {
  const variant = soulbound ? 'SoulboundAccessNFT' : 'AccessNFT'
  return `${ACCESS_GATE_PACKAGE_ID[network]}::access_gate::${variant}`
}
