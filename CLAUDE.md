# CLAUDE.md — @meddleware/walrus-storage-kit

## What this package is

A Vue 3 component library providing UI primitives for the Meddleware Walrus upload relay:
relay selection + tip estimation, NFT-gate access control (purchase CTA + ownership check),
and a blob-upload widget. Used by `@meddleware/walrus-storage-ui` (the standalone app) and by the
token-issuance app for image upload.

**Package name history:** Previously published as `@meddleware/walrus-relay-ui`; renamed to
`@meddleware/walrus-storage-kit` v0.1.0 for consistency with the `walrus-relay` repo name.

## Gate config pinning (do not change)

`relayGateConfig(network, { gateId, soulbound })` builds every relay gate config. It takes the
`access_gate` package and the `PlatformConfig` shared object from
`@meddleware/access-gate-client/deployments`, generated from `access-gate-sui`'s published records.
The caller cannot pass them in. `useAccessGate({ network, gate, getClient })` enforces the same thing
for any config it is given (`assertPinnedGate`): the package, the `PlatformConfig` and the NFT type
(at the original id, matching `soulbound`) must equal the published deployment for `network`, or it
throws. The price, the payment recipient and the platform's share are not configured: they are read
from the `Gate` and `PlatformConfig` objects on the chain (`terms`) and shown before the wallet opens.

Do NOT:

- move these ids to env vars;
- add parameters that let operators override them;
- copy them into this repo;
- build the purchase from a price that was not read from the chain.

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
  signed proof, resumable) is `createGatedAccess` in `@meddleware/walrus-storage-client/flow`, fed this
  composable's `buildConsume`.
- **Upload conventions come from `@meddleware/walrus-storage-client/flow`.** `UploadProgress`,
  `UploadStepKey`, `BlobUploadResult`, `ExistingCopy`, `getCertifyRetry` and
  `getDuplicateExisting` are defined there and imported here. The stepper catalogue
  (`CORE_UPLOAD_STEPS`, `GATED_UPLOAD_STEPS`) is UI and stays here. Import only the `./flow`
  subpath, never the walrus-storage-client root, which pulls the wasm client.
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
3. The composable validates both hosts (https; plain http only on loopback) and throws otherwise,
   health-probes the operator relay (re-checking with backoff) and falls back to the public relay if
   unreachable.

## `lib/relay.ts` — pure module, no Vue

`parseTipFromConfig`, `probeRelay`, `walrusBlobUrl`, `WALRUS_AGGREGATOR_HOSTS`, and
`MAX_SINGLE_RESERVATION_EPOCHS` live in `src/lib/relay.ts`. This module has no Vue or
`@mysten/walrus` import — it's safe to consume from non-Vue contexts (e.g. the
token-issuance app's non-reactive utils).

## What operators CAN configure (via the consuming app's env vars)

| Env var (in the app) | Purpose |
| --- | --- |
| `VITE_WALRUS_RELAY_TESTNET` | Operator relay URL for testnet |
| `VITE_WALRUS_RELAY_MAINNET` | Operator relay URL for mainnet |
| `VITE_ACCESS_GATE_ID_{NET}` | Gate shared object ID |
| `VITE_ACCESS_GATE_SOULBOUND_{NET}` | Whether NFTs are soulbound |
| `VITE_UPLOAD_RELAY_MAX_TIP_MIST` | Max tip cap passed to `createWalrusClient` |

The package and `PlatformConfig` come from `relayGateConfig`; the price comes from the gate on the chain.
Operators configure everything else.

## Deferred: NFT picker for multi-NFT wallets

`useAccessGate` currently auto-selects the NFT with the fewest uses remaining (most-depleted
first). This is the right default when users hold at most one valid NFT per gate.

When multi-NFT wallets become common (e.g. users bulk-buying upload capacity), a picker UI
should be added so the user can see all held NFTs for the current gate (objectId, variant)
and explicitly select which one to consume. The composable already surfaces `nftId` reactively;
extending it to `nftIds: Ref<string[]>` and wiring a selection UI in `WalrusStorageView.vue` is the
implementation path. Until then, auto-selection is intentional.

Separately: preventing a user from holding more than one NFT per gate should be enforced
on-chain (a `max_per_address` field on the `Gate` struct) rather than in this UI layer, since
the gateway verifies the consume event, not the purchase count.

## What NOT to do

- Do not add a `configurePackageId()` function or any API that lets operators override
  the ids `relayGateConfig` takes from `deployments`.
- Do not sign a purchase for terms the user has not seen: `purchase` reads the terms again and
  refuses when they differ from the ones shown.
- Do not import `@mysten/walrus` — the Walrus client is app-injected via `performUpload`.
- Do not add wallet-standard imports — stay wallet-agnostic.
- Do not add a build step — the package ships source for consumers to bundle.
