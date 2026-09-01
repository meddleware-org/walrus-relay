# AGENTS.md — @meddleware/walrus-relay

## Package

`@meddleware/walrus-relay` — Vue 3 component library for the Walrus upload relay UI.  
Previously published as `@meddleware/walrus-relay-ui`.

## Key files

| File | Purpose |
| --- | --- |
| `src/index.ts` | Package entry point — exports all public API |
| `src/constants.ts` | Hardcoded `ACCESS_GATE_PACKAGE_ID` + `ACCESS_GATE_PLATFORM_CONFIG_ID` (commission enforcement) |
| `src/lib/relay.ts` | Pure helpers: `parseTipFromConfig`, `probeRelay`, `walrusBlobUrl`, `MAX_SINGLE_RESERVATION_EPOCHS` |
| `src/composables/useWalrusRelay.ts` | Relay selection, health probe, tip estimation |
| `src/composables/useAccessGate.ts` | NFT ownership check, purchase flow, access-proof building |
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

Current: `0.1.0` (reset on rename from `@meddleware/walrus-relay-ui`).

## Relation to walrus-ui

`@meddleware/walrus-ui` is the standalone SPA that consumes this library.
`@meddleware/walrus-relay` is the pure library — no app entry point, no Vite config.

## Commission invariant

`constants.ts` hardcodes `ACCESS_GATE_PACKAGE_ID` and `ACCESS_GATE_PLATFORM_CONFIG_ID`.
These route the on-chain 20 bps commission to the Meddleware treasury. Do not externalise
or override these — see CLAUDE.md for the full rationale.
