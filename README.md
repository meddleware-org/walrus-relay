# @meddleware/walrus-relay

[![License: 0BSD](https://img.shields.io/badge/license-0BSD-blue)](LICENSE)

Shared Vue 3 UI for the Walrus upload relay: relay selection + tip estimation, NFT-gate access,
and a blob-upload widget. Built on [`@meddleware/walrus-client`](https://github.com/meddleware-org/walrus-client)
(its `./flow` upload conventions) and [`@meddleware/access-gate-client`](https://github.com/meddleware-org/access-gate-client)
(gate reads and the purchase/consume transactions).

Consumed by [`@meddleware/walrus-ui`](https://github.com/meddleware-org/walrus-ui) (the standalone
uploader) and the token-deployer app (icon upload), so the relay logic lives in exactly one place.

## Install

```bash
npm install @meddleware/walrus-relay
```

The package ships TypeScript/SFC source (no build step); your app's bundler compiles it. At your
app entry, import the design tokens once:

```ts
import '@meddleware/design-tokens/tokens.css' // defines the CSS vars used here
```

## Exports

| Export | Kind | Purpose |
|---|---|---|
| `useWalrusRelay(hosts, access?)` | composable | Relay selection + `/v1/tip-config` health check (re-checked with backoff when it fails) + cost estimate. `hosts` = `{ operator, public }` as a value, ref or getter; both must be https (plain http only on loopback) or it throws. |
| `useAccessGate({ network, gate, getClient })` | composable | NFT-gate ownership, the purchase terms read from the chain (`terms`), purchase and the consume builder. `gate: RelayGateConfig \| null` (null ⇒ open); a config that is not the published deployment for `network` throws. Relay access for an upload is `createGatedAccess` from `@meddleware/walrus-client/flow`, given `buildConsume`. |
| `relayGateConfig(network, { gateId, soulbound })` | fn | The gate config, with the package and `PlatformConfig` fixed to the published deployment. The price is read from the gate on the chain. |
| `WalrusUpload` | component | File picker + relay selector + upload. App injects `performUpload` (keeps `@mysten/walrus` + wallet out of this package). Pass `sessionKey` (for example `${network}:${address}`) so a change of account or network discards the file and any held retry. |
| `TipConfigBadge` | component | Live relay reachability + tip badge (a figure, "no tip", "unknown" or "above the limit"). |
| `AccessGateCta` | component | "Purchase access" prompt when gated and the wallet lacks the NFT. Shows the exact payment, recipients, network and pass read from the chain (`useAccessGate().terms`); the button stays disabled until they are read. |
| `probeRelay` / `parseTipFromConfig` | fn | Pure relay `/v1/tip-config` helpers (unit-testable, no deps). |
| `walrusBlobUrl` / `WALRUS_AGGREGATOR_HOSTS` | fn/const | Raw-blob aggregator URL builder. |
| `MAX_SINGLE_RESERVATION_EPOCHS` | const | `53` — Walrus `max_epochs_ahead`. |

## Design notes

- **Injection over import.** `WalrusUpload` takes a `performUpload(bytes, { relayHost, onStatus })`
  callback rather than importing `@mysten/walrus` or a wallet. This keeps the package light,
  wallet-agnostic, and preserves the lazy-load boundary (the app decides when to pull the wasm
  chunk). The app wires `performUpload` with `runBlobUpload` from `@meddleware/walrus-client/flow`.
  The progress, result, certify-retry and existing-copy types are that subpath's.
- **Parameterized hosts.** `useWalrusRelay` takes the operator/public host pair so each app injects
  its own relay hostnames for the active network.
- **One access-gate implementation.** `useAccessGate` builds on `@meddleware/access-gate-client`
  (paged ownership reads with exact types, purchase/consume transactions) — not a private copy.
- **Pinned deployment.** `relayGateConfig` takes the package and `PlatformConfig` from
  `@meddleware/access-gate-client/deployments`, never from the caller, and `useAccessGate` refuses a
  config that names anything else. See [CLAUDE.md](CLAUDE.md).
- **The chain is the authority on the price.** The prompt shows what the `Gate` and `PlatformConfig`
  objects say, and `purchase` reads them again before the wallet opens: if they differ from what was
  shown, or the gate is paused, no wallet prompt opens.

## Test

```bash
npm test          # Vitest: pure helpers, composables against a fake client, the widgets mounted
npm run type-check
npm run lint
npm run test:e2e  # Playwright + axe over gallery/, every theme x season (needs Chromium)
```

## License

0BSD
