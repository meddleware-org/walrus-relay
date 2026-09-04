// Localnet integration for the relay library: probe the real upload-relay and drive the access-gate
// ownership check against the localnet access_gate deployment. Gated by WALRUS_LOCALNET — the suite
// skips when ../walrus-client/localnet/.env.localnet has not been sourced, so `npm test` stays green.
import { describe, it, expect } from 'vitest'
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { probeRelay } from '../../src/lib/relay.js'
import { useAccessGate, type RelayGateConfig } from '../../src/composables/useAccessGate.js'

const READY = process.env.WALRUS_LOCALNET === '1' && !!process.env.WALRUS_RELAY_HOST

describe.skipIf(!READY)('walrus-relay localnet relay', () => {
  it('probes the localnet upload-relay as accessible (tip disabled ⇒ null)', async () => {
    const health = await probeRelay(process.env.WALRUS_RELAY_HOST!)
    expect(health.accessible).toBe(true)
    // Our localnet relay.yaml uses `!no_tip`, so tip is null (accessible either way).
    expect(health.tip === null || typeof health.tip === 'bigint').toBe(true)
  })
})

const GATE_READY =
  READY && !!process.env.ACCESS_GATE_ID && !!process.env.ACCESS_GATE_PACKAGE_ID && !!process.env.WALRUS_TEST_ADDRESS

describe.skipIf(!GATE_READY)('walrus-relay localnet access gate', () => {
  it('checkOwnership resolves against the localnet gate without throwing', async () => {
    const pkg = process.env.ACCESS_GATE_PACKAGE_ID!
    const gate: RelayGateConfig = {
      packageId: pkg,
      gateId: process.env.ACCESS_GATE_ID!,
      platformConfigId: process.env.ACCESS_GATE_PLATFORM_CONFIG_ID ?? '0x0',
      nftType: `${pkg}::access_gate::AccessNFT`,
      priceMist: 0n,
    }
    const rpc = new SuiJsonRpcClient({ url: process.env.WALRUS_RPC_URL! })
    const { checkOwnership, hasAccess, error } = useAccessGate({ gate, getClient: () => rpc })

    await checkOwnership(process.env.WALRUS_TEST_ADDRESS!)
    // The funded test address holds no pass yet, so access is a resolved boolean (false), not an
    // error — this exercises the real localnet getOwnedObjects + nft-gate-client filter path.
    expect(error.value).toBeNull()
    expect(hasAccess.value).toBe(false)
  })
})
