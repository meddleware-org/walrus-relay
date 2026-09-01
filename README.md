# @meddleware/walrus-relay

[![License: 0BSD](https://img.shields.io/badge/license-0BSD-blue)](LICENSE)

Shared Vue 3 UI for the Walrus upload relay: relay selection + tip estimation, NFT-gate access,
and a blob-upload widget. Built on [`@meddleware/walrus-client`](https://github.com/meddleware-org/walrus-client)
(the Walrus storage client) and [`@meddleware/nft-gate-client`](https://github.com/meddleware-org/nft-gate-client)
(the access-gate wire format).

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
| `useWalrusRelay(hosts, access?)` | composable | Relay selection + `/v1/tip-config` health check + cost estimate. `hosts` = `{ operator, public }`. |
| `useAccessGate({ gate, getClient })` | composable | NFT-gate ownership / purchase / access-proof. `gate: RelayGateConfig \| null` (null ⇒ open). |
| `WalrusUpload` | component | File picker + relay selector + upload. App injects `performUpload` (keeps `@mysten/walrus` + wallet out of this package). |
| `TipConfigBadge` | component | Live relay reachability + tip badge. |
| `AccessGateCta` | component | "Purchase access" CTA when gated and the wallet lacks the NFT. |
| `probeRelay` / `parseTipFromConfig` | fn | Pure relay `/v1/tip-config` helpers (unit-testable, no deps). |
| `walrusBlobUrl` / `WALRUS_AGGREGATOR_HOSTS` | fn/const | Raw-blob aggregator URL builder. |
| `MAX_SINGLE_RESERVATION_EPOCHS` | const | `53` — Walrus `max_epochs_ahead`. |
| `ACCESS_GATE_PACKAGE_ID` / `ACCESS_GATE_PLATFORM_CONFIG_ID` | const | Hardcoded Meddleware commission-routing IDs. |

## Design notes

- **Injection over import.** `WalrusUpload` takes a `performUpload(bytes, { relayHost, onStatus })`
  callback rather than importing `@mysten/walrus` or a wallet. This keeps the package light,
  wallet-agnostic, and preserves the lazy-load boundary (the app decides when to pull the wasm
  chunk). The app wires `performUpload` with `@meddleware/walrus-client`'s `createWalrusClient` /
  `createBlobUploadFlow`.
- **Parameterized hosts.** `useWalrusRelay` takes the operator/public host pair so each app injects
  its own relay hostnames for the active network.
- **One access-gate implementation.** `useAccessGate` builds on `@meddleware/nft-gate-client`
  (ownership, purchase/consume PTBs, challenge, proof) — not a private copy.
- **Commission enforcement.** `ACCESS_GATE_PACKAGE_ID` and `ACCESS_GATE_PLATFORM_CONFIG_ID` are
  hardcoded in `src/constants.ts` so every operator deployment routes the on-chain 20 bps
  commission to the Meddleware treasury. See [CLAUDE.md](CLAUDE.md).

## Test

```bash
npm test          # Vitest: pure helpers + composables against a fake client
npm run type-check
```

## License

0BSD
