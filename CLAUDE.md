# CLAUDE.md — @meddleware/walrus-relay

## What this package is

A Vue 3 component library providing UI primitives for the Meddleware Walrus upload relay:
relay selection + tip estimation, NFT-gate access control (purchase CTA + ownership check),
and a blob-upload widget. Used by `@meddleware/walrus-ui` (the standalone app) and by the
token-deployer app for image upload.

**Package name history:** Previously published as `@meddleware/walrus-relay-ui`; renamed to
`@meddleware/walrus-relay` v0.1.0 for consistency with the `walrus-relay` repo name.

## Commission enforcement (hardcoded — do not change)

`src/constants.ts` hardcodes `ACCESS_GATE_PACKAGE_ID` and `ACCESS_GATE_PLATFORM_CONFIG_ID`
for testnet and mainnet. These are the Meddleware-deployed `access_gate` Move package and
`PlatformConfig` shared object. **They are intentionally hardcoded**: any operator who
imports `@meddleware/walrus-relay` and uses the `useAccessGate` composable will automatically
route through Meddleware's `PlatformConfig`, ensuring the on-chain 20 bps commission on
every access NFT purchase routes to the Meddleware treasury.

Do NOT:
- Move these constants to env vars
- Expose them as composable parameters that operators can override
- Remove them

Update them ONLY when the `access_gate` package is upgraded on-chain (requires re-publishing
under the same address or a new one, in which case the CLAUDE.md of `access-gate-sui` will
reflect the change).

## Architectural invariants

- **No `@mysten/walrus` import.** This library must never import the Walrus wasm client
  directly. The Walrus upload flow is app-injected via the `performUpload` prop on
  `WalrusUpload`. This keeps the library free of wasm/wallet deps and preserves the
  lazy-load boundary — importing a widget never pulls the Walrus wasm chunk into the
  eager bundle.
- **No wallet dependency.** The library is wallet-agnostic. Authentication flows
  (`buildRelayAccessToken`, `purchase`) accept injected `PersonalMessageSigner` and
  `GateExecutor` interfaces — apps wire in their wallet adapters.
- **No build step.** Ships TypeScript source directly (resolved by the consuming app's
  bundler via `"exports": { ".": { "default": "./src/index.ts" } }`).
- **Composables over components.** `useWalrusRelay` and `useAccessGate` are the primary
  integration surface. The Vue components (`WalrusUpload`, `TipConfigBadge`, `AccessGateCta`)
  wire them together for common use cases; composables can be used directly for custom UIs.

## Injection pattern for relay hosts

Operator relay URLs are NOT hardcoded here. They are passed by the consuming app via the
`hosts: WalrusRelayHosts` prop (`WalrusUpload`) or via composable arguments. The pattern is:

1. App reads `VITE_WALRUS_RELAY_TESTNET` / `VITE_WALRUS_RELAY_MAINNET` from env.
2. App passes `{ operator: OPERATOR_RELAY_HOSTS[network], public: PUBLIC_WALRUS_RELAY_HOSTS[network] }`
   to `WalrusUpload` (or `useWalrusRelay`).
3. The composable health-probes the operator relay and falls back to the public relay if unreachable.

## `lib/relay.ts` — pure module, no Vue

`parseTipFromConfig`, `probeRelay`, `walrusBlobUrl`, `WALRUS_AGGREGATOR_HOSTS`, and
`MAX_SINGLE_RESERVATION_EPOCHS` live in `src/lib/relay.ts`. This module has no Vue or
`@mysten/walrus` import — it's safe to consume from non-Vue contexts (e.g. the
token-deployer app's non-reactive utils).

## What operators CAN configure (via the consuming app's env vars)

| Env var (in the app) | Purpose |
| --- | --- |
| `VITE_WALRUS_RELAY_TESTNET` | Operator relay URL for testnet |
| `VITE_WALRUS_RELAY_MAINNET` | Operator relay URL for mainnet |
| `VITE_ACCESS_GATE_ID_{NET}` | Gate shared object ID |
| `VITE_ACCESS_GATE_SOULBOUND_{NET}` | Whether NFTs are soulbound |
| `VITE_ACCESS_GATE_PRICE_MIST_{NET}` | Purchase price in MIST |
| `VITE_UPLOAD_RELAY_MAX_TIP_MIST` | Max tip cap passed to `createWalrusClient` |

`packageId` and `platformConfigId` are hardcoded — operators configure everything else.

## What NOT to do

- Do not add a `configurePackageId()` function or any API that lets operators override
  the hardcoded commission routing constants.
- Do not import `@mysten/walrus` — the Walrus client is app-injected via `performUpload`.
- Do not add wallet-standard imports — stay wallet-agnostic.
- Do not add a build step — the package ships source for consumers to bundle.
