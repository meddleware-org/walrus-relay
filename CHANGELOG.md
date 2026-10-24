# Changelog

All notable changes to `@meddleware/walrus-relay` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/). Before 0.2.0, breaking changes ship as patch releases.

## [0.1.35] - 2026-10-24

### Changed

- Access proofs use the `access-gate-gateway:access:v3` message (`@meddleware/walrus-storage-client` 0.0.32; workspace ADR-0004); `@meddleware/access-gate-client` 0.0.12 (new `access_gate` published-at; zero payment recipient refused); `@meddleware/ui` 0.1.34.

## [0.1.34] - 2026-10-24

### Changed

- Renamed from `walrus-relay` to `walrus-storage-kit` (workspace naming convention, `docs/architecture/ADR-0003-naming.md`). No code change beyond names, paths, hostnames and dependency names; the history below keeps the old names.

## [0.1.33] - 2026-10-22

### Changed

- @meddleware/walrus-client ^0.0.30 and @meddleware/access-gate-client ^0.0.10 (stale indexer fallback, nft-gate-client 0.0.18 rules incl. the flow's real challenge expiry)

## [0.1.32] - 2026-10-19

### Changed

- `MAX_TIP_MIST` (the ceiling on a relay-reported tip) is now `5_000_000` MIST (0.005 SUI), down from 0.05 SUI, in
  line with walrus-client 0.0.29's default `uploadRelayMaxTipMist`: about 8× the worst-case tip of the operator's
  re-priced relay (`100_000` MIST + 1 MIST per encoded KiB; workspace cost model, decision D57). A relay reporting
  a higher tip is shown as above the ceiling.

## [0.1.31] - 2026-10-10

### Changed (breaking, pre-v0.2)

- **`useAccessGate` takes `network` and checks the gate config.** `useAccessGate({ network, gate, getClient })`
  throws unless `gate` names the published `access_gate` deployment for `network` (package, `PlatformConfig`,
  NFT type at the original id, matching `soulbound`). `getClient` is called with the network.
- **The purchase price is read from the chain.** `RelayGateConfig` and `relayGateConfig`'s input no longer carry
  `priceMist`; `AccessGateCta` no longer takes `priceMist`. `useAccessGate` exposes `terms`, `termsLoading`,
  `termsError`, `purchaseError` and `loadTerms()`; `getClient` must also serve single-object reads
  (`GateClient`, which a `SuiGrpcClient` is). `AccessGateCta` takes `terms` (and optionally `termsError`,
  `purchaseError`) and shows the exact payment, the operator and platform payees, the network and the pass kind;
  its button stays disabled until the terms are read, and while the gate is paused.
- **`purchase` signs only for terms the user has seen.** It reads the terms again before the wallet opens and
  throws, publishing the new terms, if they differ from `terms` as last shown (or none were shown); a paused gate
  and an unreadable price stop it before any prompt; an `access_gate` abort is reported in words.
- **`RelayHealth` gains `tipStatus` and `tipKind`.** `none | known | unknown | over-ceiling`; `TipConfigBadge`
  shows "no tip" only for a relay that advertises none, and "unknown" or "above the limit" otherwise; an invalid
  host shows "Relay address is not valid" instead of staying on "Checking relay…". `probeRelay` documents that it
  throws for an invalid host.
- **`useWalrusRelay` validates its hosts and follows its inputs.** Both hosts must be https (plain http only on
  loopback, now including `[::1]`) or it throws; `hosts` and `access` may be a value, a ref or a getter and are
  followed (a new host pair starts the selection, tip configs and health check over; invalid later hosts set
  `configError` and offer no relay). Hosts are compared by origin. A failed operator health check is re-checked
  with backoff (`HEALTH_RECHECK_DELAYS_MS`); the public relay's tip is read, not assumed zero (its label is now
  "Public relay (fallback)"). New `relayFeeStatus`, `configError` and `stop()`; `RelayOption` gains `tipStatus`.
- **`WalrusUpload` takes an optional `sessionKey`.** A change of it, of the relay hosts, or a disconnect discards
  the chosen file and any held certify or upload retry, and the result of an upload that finishes afterwards is
  not reported (`settled` still fires). The cost line says "relay fee unknown" or "above the safety limit"
  instead of leaving the fee out; the approvals hint is derived from the access mode (`RelayAccessOptions.singleUse`
  makes it exact). The duplicate dialog's buttons set their own colours (they were unreadable in the dark theme).

### Fixed

- `walrusBlobUrl` looks the network up as an own key (`'constructor'` is an unknown network, not an accident).
- The `/v1/tip-config` body is read with a 16 KiB cap (`readBoundedJson`); an oversized or non-JSON body is an
  unknown tip. A host with a trailing slash no longer produces `//v1/tip-config`.
- `requireHttpsHost` allows plain http only for the `http:` scheme on a loopback host.

### Added

- `describeTip`, `fetchTipConfig`, `readBoundedJson`, `formatCoinExact`, `relayOrigin`, `assertPinnedGate`,
  `TipStatus`, `PurchaseTerms`, `GateClient` and `PENDING_PURCHASE_MS` exports.
- Widget tests (upload options, cost line, duplicate prompt, certify and upload retry, session reset), badge, prompt,
  host-validation and purchase-terms tests (161 tests), and a Playwright + axe contrast gate over a component
  gallery for every theme x season (`npm run test:e2e`).
- `engines.node` is `>=24`; `CHANGELOG.md` and `SECURITY.md` are published.
- Depends on `@meddleware/walrus-client` ^0.0.28, `@meddleware/access-gate-client` ^0.0.9 and
  `@meddleware/design-tokens` ^0.1.10.

### Security

- Test files are no longer in the tarball (they moved to `tests/`); the publish workflow runs lint and the contrast
  gate and fails if a test file or gallery file would be packed; the integration workflow uses `npm ci`.
- `SECURITY.md`, the package description ("Built on walrus-client + access-gate-client") and the README, AGENTS.md
  and CLAUDE.md are current; the economics wording is gone from `src` and the package docs.
