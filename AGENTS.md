# AGENTS.md — @meddleware/walrus-storage-kit

## Package

`@meddleware/walrus-storage-kit` — Vue 3 component library for the Walrus upload relay UI.  
Previously published as `@meddleware/walrus-relay-ui`.

## Key files

| File | Purpose |
| --- | --- |
| `src/index.ts` | Package entry point — exports all public API |
| `src/constants.ts` | `relayGateConfig` and `assertPinnedGate` — gate config with the package and `PlatformConfig` fixed to the published deployment |
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

## Relation to walrus-storage-ui

`@meddleware/walrus-storage-ui` is the standalone SPA that consumes this library.
`@meddleware/walrus-storage-kit` is the pure library — no app entry point, no Vite config.

## Gate config invariant

`relayGateConfig` takes the package and `PlatformConfig` from
`@meddleware/access-gate-client/deployments`, never from the caller, and `useAccessGate` refuses a
config that names anything else. The purchase price and recipients are read from the chain, not from
config. Do not externalise or override the ids; see CLAUDE.md.

## Checks

```bash
npm run type-check && npm run lint && npm test
npm run test:e2e   # real-browser axe contrast gate over gallery/, every theme x season (needs Chromium)
```
