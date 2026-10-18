// Localnet integration for the relay library: probe the real upload-relay and read the access-gate
// objects the way `useAccessGate` does (ownership by exact type, the Gate and the PlatformConfig for the
// purchase terms), against the localnet access_gate deployment. Gated by WALRUS_LOCALNET — the suite
// skips when ../walrus-client/localnet/.env.localnet has not been sourced, so `npm test` stays green.
//
// `useAccessGate` itself refuses any package other than the published testnet/mainnet deployment, so a
// localnet gate cannot be driven through it; this suite calls the same access-gate-client reads.
import { describe, it, expect } from 'vitest'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import {
  accessNftType,
  fetchAccessNfts,
  fetchGate,
  fetchPlatformConfig,
  gateCommissionMist,
} from '@meddleware/access-gate-client'
import { probeRelay } from '../../src/lib/relay.js'

const READY = process.env.WALRUS_LOCALNET === '1' && !!process.env.WALRUS_RELAY_HOST

describe.skipIf(!READY)('walrus-relay localnet relay', () => {
  it('probes the localnet upload-relay as accessible (tip disabled ⇒ none)', async () => {
    const health = await probeRelay(process.env.WALRUS_RELAY_HOST!)
    expect(health.accessible).toBe(true)
    // Our localnet relay.yaml uses `!no_tip`; either way the status says which it is.
    expect(['none', 'known', 'unknown', 'over-ceiling']).toContain(health.tipStatus)
    expect(health.tip === null || typeof health.tip === 'bigint').toBe(true)
  })
})

const GATE_READY =
  READY && !!process.env.ACCESS_GATE_ID && !!process.env.ACCESS_GATE_PACKAGE_ID && !!process.env.WALRUS_TEST_ADDRESS

describe.skipIf(!GATE_READY)('walrus-relay localnet access gate', () => {
  const pkg = process.env.ACCESS_GATE_PACKAGE_ID!
  const rpc = () => new SuiGrpcClient({ network: 'localnet', baseUrl: process.env.WALRUS_RPC_URL! })

  it('the ownership read resolves against the localnet gate without throwing', async () => {
    // The funded test address holds no pass yet, so the result is an empty list, not an error — this
    // exercises the real localnet listOwnedObjects + access-gate-client exact-type path.
    const nfts = await fetchAccessNfts(rpc(), process.env.WALRUS_TEST_ADDRESS!, accessNftType(pkg, false), process.env.ACCESS_GATE_ID!)
    expect(nfts).toEqual([])
  })

  it('the purchase terms read parses the live Gate and PlatformConfig', async () => {
    const client = rpc()
    const gate = await fetchGate(client, process.env.ACCESS_GATE_ID!, pkg)
    expect(gate).not.toBeNull()
    const platform = await fetchPlatformConfig(client, process.env.ACCESS_GATE_PLATFORM_CONFIG_ID!, pkg)
    const platformShare = gateCommissionMist(gate!, platform)
    // The platform's part of the price can never exceed the price (the operator's part is the rest).
    expect(platformShare <= gate!.priceMist).toBe(true)
  })
})
