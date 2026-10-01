# AGENTS.md — @meddleware/walrus-relay

## Package

`@meddleware/walrus-relay` — Vue 3 component library for the Walrus upload relay UI.  
Previously published as `@meddleware/walrus-relay-ui`.

## Key files

| File | Purpose |
| --- | --- |
| `src/index.ts` | Package entry point — exports all public API |
| `src/constants.ts` | `relayGateConfig` — gate config with the package and `PlatformConfig` fixed to the published deployment (commission enforcement) |
| `src/lib/relay.ts` | Pure helpers: `parseTipFromConfig`, `probeRelay`, `walrusBlobUrl`, `MAX_SINGLE_RESERVATION_EPOCHS` |
| `src/composables/useWalrusRelay.ts` | Relay selection, health probe, tip estimation |
| `src/composables/useAccessGate.ts` | NFT ownership check, purchase flow, consume builder |
| `src/components/WalrusUpload.vue` | Upload widget (relay select + upload orchestration) |
| `src/components/TipConfigBadge.vue` | Relay reachability + tip display badge |
| `src/components/AccessGateCta.vue` | "Purchase access" CTA for gated relays |

## Build and test commands

```bash
npm install
npm run type-check    # vue-tsc type check
npm test              # vitest unit tests
```

## Version

See `package.json` (the version was reset to `0.1.0` on the rename from `@meddleware/walrus-relay-ui`).

## Relation to walrus-ui

`@meddleware/walrus-ui` is the standalone SPA that consumes this library.
`@meddleware/walrus-relay` is the pure library — no app entry point, no Vite config.

## Commission invariant

`relayGateConfig` takes the package and `PlatformConfig` from
`@meddleware/access-gate-client/deployments`, never from the caller. This routes the on-chain
platform commission to the Meddleware treasury. Do not externalise or override them; see CLAUDE.md
for the full rationale.
