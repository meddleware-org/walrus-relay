# CLAUDE.md — @meddleware/walrus-relay

## What this package is

A Vue 3 component library providing UI primitives for the Meddleware Walrus upload relay:
relay selection + tip estimation, NFT-gate access control (purchase CTA + ownership check),
and a blob-upload widget. Used by `@meddleware/walrus-ui` (the standalone app) and by the
token-deployer app for image upload.

**Package name history:** Previously published as `@meddleware/walrus-relay-ui`; renamed to
`@meddleware/walrus-relay` v0.1.0 for consistency with the `walrus-relay` repo name.

## Commission enforcement (do not change)

`relayGateConfig(network, { gateId, soulbound, priceMist })` builds every relay gate config.
It takes the `access_gate` package and the `PlatformConfig` shared object from
`@meddleware/access-gate-client/deployments`, generated from `access-gate-sui`'s published records.
The caller cannot pass them in. Any operator who uses this library therefore routes through
Meddleware's `PlatformConfig`, and the on-chain platform commission on every access NFT purchase
goes to the Meddleware treasury.

Do NOT:

- move these ids to env vars;
- add parameters that let operators override them;
- copy them into this repo.

They change only when `access-gate-sui` publishes a new deployment record. Bump
`@meddleware/access-gate-client` to pick it up.

## Architectural invariants

- **No on-chain logic here — extend the domain client.** `suiBoundary()` from
  `@meddleware/eslint-config` (the last entry in `eslint.config.ts`) forbids, in `src/` outside
  `src/wallet.ts`: value imports of `@mysten/sui/{grpc,client,transactions}` (type-only imports are
  fine; `@mysten/sui/jsonRpc` is banned outright), building transactions and chain reads. URL
  bindings on native elements must go through `safeHref`, `safeIcon`, `suiExplorerUrl` or
  `walruscanBlobUrl`. Do not disable it — move the logic into the domain client instead.
- **No `@mysten/walrus` import.** This library must never import the Walrus wasm client
  directly. The Walrus upload flow is app-injected via the `performUpload` prop on
  `WalrusUpload`. This keeps the library free of wasm/wallet deps and preserves the
  lazy-load boundary — importing a widget never pulls the Walrus wasm chunk into the
  eager bundle.
- **No wallet dependency.** The library is wallet-agnostic. `purchase` accepts an injected
  `GateExecutor` and apps wire in their wallet adapters. Relay access for an upload (consume +
  signed proof, resumable) is `createGatedAccess` in `@meddleware/walrus-client/flow`, fed this
  composable's `buildConsume`.
- **Upload conventions come from `@meddleware/walrus-client/flow`.** `UploadProgress`,
  `UploadStepKey`, `BlobUploadResult`, `ExistingCopy`, `getCertifyRetry` and
  `getDuplicateExisting` are defined there and imported here. The stepper catalogue
  (`CORE_UPLOAD_STEPS`, `GATED_UPLOAD_STEPS`) is UI and stays here. Import only the `./flow`
  subpath, never the walrus-client root, which pulls the wasm client.
- **No build step.** Ships TypeScript source directly (resolved by the consuming app's
  bundler via `"exports": { ".": { "default": "./src/index.ts" } }`).
- **Modals use `@meddleware/ui`'s `UiDialog`.** `WalrusUpload`'s blocking progress dialog is
  `UiDialog :dismissible="false"` (native modal: page inert, focus kept inside — no hand-rolled
  focus trap); the duplicate-blob prompt is a dismissible `UiDialog`. Do not reintroduce
  `div role="dialog"` overlays.
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

The package and `PlatformConfig` come from `relayGateConfig`. Operators configure everything else.

## Deferred: NFT picker for multi-NFT wallets

`useAccessGate` currently auto-selects the NFT with the fewest uses remaining (most-depleted
first). This is the right default when users hold at most one valid NFT per gate.

When multi-NFT wallets become common (e.g. users bulk-buying upload capacity), a picker UI
should be added so the user can see all held NFTs for the current gate (objectId, variant)
and explicitly select which one to consume. The composable already surfaces `nftId` reactively;
extending it to `nftIds: Ref<string[]>` and wiring a selection UI in `WalrusView.vue` is the
implementation path. Until then, auto-selection is intentional.

Separately: preventing a user from holding more than one NFT per gate should be enforced
on-chain (a `max_per_address` field on the `Gate` struct) rather than in this UI layer, since
the gateway verifies the consume event, not the purchase count.

## What NOT to do

- Do not add a `configurePackageId()` function or any API that lets operators override
  the commission-routing ids `relayGateConfig` takes from `deployments`.
- Do not import `@mysten/walrus` — the Walrus client is app-injected via `performUpload`.
- Do not add wallet-standard imports — stay wallet-agnostic.
- Do not add a build step — the package ships source for consumers to bundle.
