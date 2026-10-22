# Security Audit — `walrus-relay`

**Classification:** Internal security review (awaiting external review)
**Project:** walrus-relay (`@meddleware/walrus-relay`) — the shared Vue 3 UI library for the Walrus
upload relay.

- relay selection and tip estimation (`useWalrusRelay`, `lib/relay.ts`, `TipConfigBadge`);
- NFT-gate state and purchase (`useAccessGate`, `AccessGateCta`), built on
  `@meddleware/access-gate-client`;
- the commission-pinned gate config (`relayGateConfig`);
- the upload widget (`WalrusUpload`), which drives an app-injected `performUpload`, normally
  `@meddleware/walrus-client/flow`.

**Project type:** UI library (Vue 3 SFCs + composables; ships TypeScript/SFC source, no build step)
**Template:**

- AUDIT_TEMPLATE.md (2026-10-08)
- AUDIT_TEMPLATE_VUE.md (2026-10-08)
- AUDIT_TEMPLATE_WALRUS.md (2026-09-30)
- AUDIT_TEMPLATE_SUI_CLIENT.md (2026-10-08)
- AUDIT_TEMPLATE_TS.md (2026-10-08)

Not triggered: AUTH (no credentials; access proofs live in walrus-client and nft-gate-client), SEAL,
OPS (the integration workflow reuses walrus-client's localnet harness, audited there; it publishes
nothing to a real chain), IMG (no image; the library is not deployed from one), PROXY, WORKERS, GO,
RUST, SITE, PLATFORM.

**Deployment status:**

- **2026-10-22: npm `latest` is 0.1.33** (tag `v0.1.33` = `d8a1412`): 0.1.32 (tag `v0.1.32`, 2026-10-19) lowered `MAX_TIP_MIST` to 0.005 SUI (F1); 0.1.33 takes `@meddleware/walrus-client` `^0.0.30` and `@meddleware/access-gate-client` `^0.0.10`
  (the stale-indexer fallback, and `nft-gate-client` 0.0.18's rules including the gated flow's real challenge expiry; walrus-client audit F26). No source change in this package for 0.1.33. Consumers: walrus-ui 0.1.61 and token-deployer-ui 0.0.38 at `^0.1.33`.
- Published (the 2026-10-18 release of the fix wave): npm `@meddleware/walrus-relay` **0.1.31** (published 2026-10-18T09:00Z), from tag
  `v0.1.31` = `2cf8b18` (code in `24d7c43` and the version-bump commit `4aa217d`; the two commits after it touch only this audit), with
  an SLSA v1 provenance attestation (`dist.attestations`, checked 2026-10-18). 0.1.30 (tag `v0.1.30` =
  `e57b06e`, attested like 0.1.27 to 0.1.29) was the version of the 2026-10-09 pass.
- Fix wave 2026-10-10, released as **0.1.31** on 2026-10-18: fixes F9–F14, F16, F17
  (except the integration refs), F21–F23 and the open Section D code gates. It is breaking for the consumers
  (pre-v0.2: patch bump): `useAccessGate` takes `network`, the price is no longer configured, `AccessGateCta`
  takes `terms`; walrus-ui and token-deployer-ui have the matching bump.
- Consumers, at `^0.1.31` (bumped 2026-10-18; both lockfiles resolve 0.1.31; `^0.1.30` before):
  - walrus-ui: `WalrusView`, gate config via `relayGateConfig`;
  - token-deployer-ui: `IconPicker`;
  - the dashboard, through both.
- The live gated path is testnet: the operator relay behind the nft-gate Workers gateway.
  - The library does not hard-code the gate. The package and `PlatformConfig` come from
    access-gate-client 0.0.8 `deployments` (0.0.9 in 0.1.31, same record) (`access_gate` `0xd7ddaa94…88c9`, republished
    2026-10-09; `PlatformConfig` `0x3f81489d…e7b5`).
  - The relay `Gate` object id is the app's `VITE_ACCESS_GATE_ID_TESTNET`. The live gate is
    `0x316f1bf9…faddc` (soulbound, 10 uses, 0.01 SUI), on the new package. The old gate
    `0xfd6c3b…` is on the superseded, now immutable package `0xa55789…`.
- Paywall e2e PASS 2026-10-09 against the live dashboard (pass bought on gate `0x316f1bf9…`,
  consumed, `nft-gate:access:v2` proof, upload through the Worker). The proof is built by
  walrus-client and nft-gate-client, not by this library.

**Review date:** 2026-09-18 (first pass, corpus) · **re-verified 2026-10-03** · **re-verified 2026-10-09** · **fix wave 2026-10-10** · **release status 2026-10-18**
**Reviewer:** Internal review
**Severity ceiling:** Medium.

- The library holds no keys, imports no wallet or wasm, and decides no access.
- But it builds and submits the purchase PTB through an injected executor, steers relay selection
  (and so commission and tip revenue), and is where users see prices and fees.
- Realised at this pass: **Low**. F1–F5 from the first pass, F15 and (in 0.1.31) F9–F14, F16, F21–F23 are
  resolved, and no open finding exceeds Info.

**Status:** third pass re-verified 2026-10-09 at `e57b06e` (tag `v0.1.30`); fix wave 2026-10-10 on top of it
(0.1.31, commit `24d7c43`), released 2026-10-18 and consumed by walrus-ui and token-deployer-ui at `^0.1.31`.

- The first pass (corpus file `walrus-relay-audit.md`, 2026-09-18) covered npm 0.1.12, predates the
  lens templates, and described constants and dependencies that no longer exist.
- This file replaces it. F1–F8 and OQ1–OQ6 are preserved; F9–F18 and OQ7–OQ8 date from the second
  pass (2026-10-03); new IDs from this pass start at **F19**.
- Between 0.1.26 and 0.1.30 the library fixed F15 and gained the chain-access lint boundary (F19)
  and the same-registration upload retry (F20). The other second-pass findings (F9–F14, F16, and
  the rest of F17) and F21–F23 (new in the third pass: VUE, TS and placement-rule checks) were **not
  fixed in code** at 0.1.30; the 2026-10-10 fix wave resolves them in 0.1.31, except two residual items
  named in F17 (integration refs) and OQ9 (a wording decision, since decided: 2026-10-18).

**Package manager / lockfile:** npm; `package-lock.json` committed.
**Module format:** ESM.
**Publish model:** ships source. `exports["."]` = `src/index.ts` for both `types` and `default`.
`files` = `src`, `CHANGELOG.md`, `SECURITY.md`; since 0.1.31 the tests live in `tests/` and are not packed (F17).
`engines.node` is `>=24` (fleet decision D41).
**Runtime targets:** browser (consumers compile the source); CI on Node 24.
**Peer dependencies:** `vue` `^3.5.0`, `@mysten/sui` `^2.33.2`, `@mysten/walrus` `~1.2.32` (the last
two since 0.1.27).
**Dependencies:**

| Package | Range |
| --- | --- |
| `@meddleware/access-gate-client` | `^0.0.9` (0.1.31; was `^0.0.8`) |
| `@meddleware/walrus-client` | `^0.0.28` (0.1.31; was `^0.0.27`) |
| `@meddleware/ui` | `^0.1.31` |
| `@meddleware/design-tokens` | `^0.1.10` (0.1.31; was `^0.1.9`) |

**Installed tree (2026-10-09; 0.1.31 changes only the first-party ranges above):** `@mysten/sui` 2.35.0 and `@mysten/walrus` 1.2.34 (with `@mysten/walrus-wasm`
0.3.1), one copy of each; vue 3.5.43. `npm ls --all` is clean (exit 0).

**Build tool:** none (ships source). Dev tooling: vitest 5.0.3, vue-tsc 3.3.12, TypeScript 6.0.3,
`@vitejs/plugin-vue` 6.0.9.
**Hosting:** n/a (a library; the consuming apps host it).
**Embedding hosts:** walrus-ui, token-deployer-ui (`IconPicker`), and the dashboard through both.
**VITE_\* inventory:** none read by the library. The consuming apps pass `VITE_WALRUS_RELAY_*`,
`VITE_ACCESS_GATE_ID_{NET}`, `VITE_ACCESS_GATE_SOULBOUND_{NET}`, `VITE_ACCESS_GATE_PRICE_MIST_{NET}`
and `VITE_UPLOAD_RELAY_MAX_TIP_MIST` in as arguments (none is secret; the gate id and price are
public, and the commission-routing ids are not env at all).

**SUI_CLIENT lens front matter:**

- **Sui SDK:** `@mysten/sui` 2.35.0 installed, peer `^2.33.2` (ADR-0001 says `^2.33.1`; the higher
  floor matches the peers of `@mysten/walrus` 1.2.32 and access-gate-client).
- **Transport:** none of its own. The consumer injects the client (`getClient`); the apps use gRPC.
  The library's `src` imports only types from `@mysten/sui/transactions`; the localnet integration
  test uses `SuiGrpcClient`. No JSON-RPC.
- **Networks:** testnet (mainnet throws until `access_gate` is recorded there; there is no Walrus
  localnet, and the integration test builds its gate by hand).
- **On-chain packages consumed:** see the on-chain dependency matrix.

**WALRUS lens front matter:**

- **Walrus SDK:** not imported. It reaches the app through walrus-client (`@mysten/walrus` 1.2.34,
  `@mysten/walrus-wasm` 0.3.1 in this tree); since 0.1.27 it is also a peer dependency, so a host
  has one copy.
- **Package config source:** n/a (in walrus-client).
- **Upload relays:** injected by the app as `hosts: { operator, public }`. walrus-ui and
  token-deployer-ui supply them from `VITE_WALRUS_RELAY_*` plus walrus-client's
  `PUBLIC_UPLOAD_RELAY_HOSTS`.
- **Aggregators:** `WALRUS_AGGREGATOR_HOSTS`, which duplicates walrus-client's, for `walrusBlobUrl` (looked up as an
  own key since 0.1.31, F22).
- **Tip ceiling (display):** `MAX_TIP_MIST = 5_000_000n` (`src/lib/relay.ts`, 0.005 SUI since 0.1.32; 0.05 SUI
  before). The authoritative cap is walrus-client's `uploadRelayMaxTipMist` (same default from walrus-client
  0.0.29), enforced by the SDK.
- **Epoch default / maximum:** 53 / 53, clamped in the widget (`WalrusUpload.vue:96-99`).
- **Deletable default:** **permanent**. It is an explicit, explained checkbox, ticked by default
  (`WalrusUpload.vue:93-95, 374-383`).

**Location:** `walrus-relay/docs/audit/walrus-relay-audit.md`. This repo-local file is canonical; the
workspace-corpus copy (`docs/audit/walrus-relay-audit.md`) predates it and was not touched in this pass.

---

## Executive summary

`@meddleware/walrus-relay` is a thin, well-bounded library: 3 SFCs, 2 composables and 3 pure modules (about 2,000
lines of source), with 161 tests in 8 files at 0.1.31.

- **No dangerous imports.** It imports no wallet and no `@mysten/walrus`. The upload is injected.
- **No inline chain logic, enforced.** On-chain work goes through access-gate-client builders and
  fail-closed readers, and since 0.1.27 the shared `suiBoundary()` lint rule fails CI on a value
  import of the Sui transport or transaction builders (F19).
- **Gate config pinned in the purchase path (0.1.31, F10).** `relayGateConfig` takes the package and
  `PlatformConfig` only from the published deployment (`access_gate` `0xd7ddaa94…`), and `useAccessGate`
  refuses any config that names another package, `PlatformConfig` or NFT type for its network. The gate id is
  the app's, not the library's.
- **The chain is the authority on the price (0.1.31, F11).** The purchase prompt shows the exact payment, the
  operator and platform payees and shares, the network and the pass kind, all read from the `Gate` and
  `PlatformConfig`; `purchase` reads them again before the wallet opens and refuses a changed term, a paused
  gate or an unreadable price.
- **Tested anti-bypass policy.** Relay selection withholds the free public relay while the operator
  relay is up and the user has not paid, offers nothing while checks are pending or when the hosts are
  invalid, and re-checks a failed operator relay with backoff (F12).
- **Safe wallet switching.** A generation counter discards stale ownership and terms; the widget drops its file
  and held retries when the session key, hosts or connection change (F16).
- **Usable passes only.** Passes are a discriminated variant with an exact `bigint` count; an
  exhausted receipt is not access and an unparseable variant is dropped (F15).
- **No double purchase.** A two-minute guard prevents buying a second pass while the first is being
  indexed.
- **Honest tip display (F9).** The badge and the cost line distinguish no tip, a known tip, an unknown tip and a
  tip above the ceiling; both tip modes are parsed, negatives are rejected, values are clamped to the workspace
  ceiling, and the body is read with a 16 KiB cap (F22).
- **Safe rendering.** No `v-html` or `:href` sinks.
- **Accessible modal and measured contrast.** The blocking upload dialog is a native modal (`UiDialog`); a
  Playwright + axe gate over a gallery of the three components checks contrast in every theme x season (F21).
- **Explicit permanence.** Permanence is an explained default.
- **Paid-upload recovery.** A failed relay upload after registration offers "Retry upload" on the
  same registration, with no second payment (F20); the widget paths are tested (F14).
- **Supply-chain gate.** CI runs an audit gate with an expiring allowlist; Dependabot is on (weekly,
  grouped); the publish workflow runs lint and the contrast gate.

**Findings by disposition (2026-10-10, 0.1.31):**

| Disposition | Findings |
| --- | --- |
| RESOLVED | F1 tip ceiling (0.005 SUI since 0.1.32), F2 negative tips, F3 empty mainnet constants (superseded by `relayGateConfig`), F4 https hosts, F5 blob-id encoding, F7 optimistic decrement (removed), F9 tip display, F10 gate config pinned in `useAccessGate`, F11 on-chain price and full disclosure, F12 host validation and re-checks, F13 stale docs and copy, F14 widget tests, F15 unknown use count (0.1.27), F16 cross-account state, F19 chain-access lint boundary, F20 same-registration upload retry, F21 contrast gate, F22 bounded parsing, F23 placement rule |
| MITIGATED | F17 packaging, CI and style (test files out of the tarball, lint and `npm ci` in the release path, peer floor and Sui CLI pin done; the unpinned integration refs remain) |
| ADJUDICATED | F6 injected interfaces (by design) |
| DEFERRED | none |
| Positive | F8 fail-closed ownership, F18 selection policy and supply chain |
| Answered | OQ1–OQ9 (recorded below) |

**Findings still outstanding at this pass** (all Info):

- **F17 remainder — the integration workflow checks out `walrus-client` and `access-gate-sui` at
  `vars.*_REF || 'main'`.** Pinning a commit needs a choice of commit, shared with walrus-client's own CI.
- **OQ9** — `WHITE_LABEL_COMMISSION.md` §4 said commission mechanics are not surfaced to end users beyond a
  "small fee applies" framing; the purchase prompt shows the platform's share as an amount read from the
  chain, labelled "Platform fee". **(Decided 2026-10-18: keep the amount.** A signing prompt must show what
  will move and to whom, and the wallet shows the same transfers. §4 governs documentation placement — the
  model behind the figure stays out of user docs and package source — and was amended to say the purchase
  prompt is not documentation.)
- Maintainer and mainnet items: the `access_gate` mainnet deployment, the external review.

---

## Threat model / trust boundaries

| Actor | Holds / proves | Can do | Bounded by |
| --- | --- | --- | --- |
| **Malicious or compromised relay** | `GET {host}/v1/tip-config`; the upload endpoint (via the app) | Report a huge, negative or malformed tip; go down to force the fallback | `parseTipConfig` / `estimateTipMist` (BigInt, negatives → `null`, ceiling → `null`). The real payment is capped by the SDK. The badge distinguishes none, known, unknown and above-ceiling tips (F9); the body is read with a 16 KiB cap (F22). Downtime yields the public fallback, re-checked with backoff (F12). |
| Consuming app (trusted embedder) | injects `hosts`, `performUpload`, `GateExecutor`, `gate`, `getClient`, `estimateStorageCost` | Anything its wallet can sign | Trusted (F6). The gate config must be the published deployment for the network, or `useAccessGate` throws (F10); the hosts must be https (F12). |
| End user / wallet | Connected account, possibly holding several passes | Choose the file, epochs and permanence; buy; upload | Epochs clamp; permanent default; most-depleted pass first; pending-purchase guard; generation guard on switch; the wallet opens only for terms the user has seen (F11); the widget resets on a session change (F16) |
| Gate operator (on-chain) | `AdminCap`: price, pause, default uses (the pass kind is fixed at creation since `access_gate` 2026-10-09) | Change the price, recipient or pause after the prompt was shown | `purchase` reads the terms again and stops before the wallet opens if they changed or the gate is paused; the on-chain split still aborts if underpaid (F11) |
| Gateway in front of the operator relay | access-proof verification | Admit or reject uploads | Server-side. The library's selection policy is revenue steering, not access control (WAL-M3, §A). |
| Supply-chain attacker | publish rights to a dependency | Ship malicious source (consumers compile `src`) | Lockfile; audit gate with an expiring allowlist; OIDC provenance on publish |

### On-chain dependency matrix (SUI_CLIENT lens)

| Object / package | ID | Sourced from | Used as | If stale / wrong | Fails |
| --- | --- | --- | --- | --- | --- |
| `access_gate` package | original-id = published-at `0xd7ddaa94…88c9` (testnet; republished 2026-10-09, access-gate-client 0.0.9 carries the same record). The superseded `0xa55789…` is immutable. | `relayGateConfig` → access-gate-client `accessGateDeployment`; checked again by `assertPinnedGate` in `useAccessGate` | `buildPurchaseTx` / `buildConsumeTx` target | a retired version → `E_WRONG_VERSION` (reported in words); a foreign package is refused at construction (F10) | closed |
| `PlatformConfig` | `0x3f81489d…e7b5` | same | purchase and consume argument; read for the platform's payee and share (F11) | — | closed |
| `AccessNFT` / `SoulboundAccessNFT` type | original-id | `accessNftType(originalId, soulbound)` | ownership filter (exact type) | look-alike rejected (access-gate-client) | closed |
| Relay `Gate` | live testnet gate `0x316f1bf9…faddc` (soulbound, 10 uses, 0.01 SUI); the old `0xfd6c3b…` is on the superseded package | operator env (`VITE_ACCESS_GATE_ID_{NET}`) → app → `relayGateConfig({ gateId })`; never in this library | ownership filter, purchase, consume | a wrong or old gate ⇒ no ownership (type filter is the new package) / an on-chain abort | closed |
| Gate price, payee, pause | the `Gate` object, read with `fetchGate` (parsed under the original id) | the chain, not env | the split amount, the displayed terms, the paused check | read again before signing; a change stops the purchase (F11) | closed |

---

## Severity scale

Critical / High / Medium / Low / Info / Positive.

## Scope

**In scope (HEAD `e57b06e` = tag `v0.1.30`, 2026-10-09; the fix wave 2026-10-10 is 0.1.31, commit `24d7c43`; the second pass was at `f6085e9` = `v0.1.26`):**

- `src/{index,constants,env.d}.ts`, `src/lib/{relay,upload-steps}.ts`,
  `src/composables/{useAccessGate,useWalrusRelay}.ts`,
  `src/components/{WalrusUpload,AccessGateCta,TipConfigBadge}.vue`;
- the tests (`tests/*.test.ts`, `tests/helpers/`, `tests/integration/relay.integration.test.ts`; they were under `src/` until 0.1.30) and the contrast gate (`gallery/`, `e2e/`, `playwright.config.ts`, `vite.gallery.config.ts`);
- `package.json`, the lockfile, `tsconfig.json`, `vitest*.config.ts`, the eslint, stylelint and
  postcss configs;
- `README.md`, `SECURITY.md`, `CLAUDE.md`, `AGENTS.md`;
- `CHANGELOG.md` (new in 0.1.31);
- `.github/workflows/{node-ci,npm-publish,integration}.yml`, `.github/audit-gate.mjs`,
  `.github/audit-allowlist.json`.

**Cross-repo evidence (read-only):**

- walrus-ui: `src/config.ts:68-80` (`relayGateConfig` wiring); `src/components/WalrusView.vue:49-50,
  118` (`useAccessGate` per network, `getClient: () => getSuiClient()`; `singleUse: state.singleUse.value`
  since 0.1.27);
- token-deployer-ui: `IconPicker.vue:37` (`getClient: () => getReadClient(walrusNet)`, bound to the
  gate's network);
- access-gate-client 0.0.8 (`fetchAccessNfts`, `isUsablePass`, builders, `deployments`);
- walrus-client 0.0.27 (`./flow` conventions, `getUploadRetry`, audience-bound `nft-gate:access:v2`
  proofs).

**Out of scope:** the first-party dependencies (own audits); the relay, gateway and aggregator
services; the consuming apps (facts cited).

**Environment / commands (2026-10-10 fix wave, Node 24.13.0; the 2026-10-09 pass is the left-hand figure where it differs):**

| Command | Result |
| --- | --- |
| `npm ci --dry-run` | clean (the lockfile matches `package.json`) |
| `npx vitest run` | **161 passed** (8 files; was 44 in 6 files: the widget, badge, prompt, terms, host and tip-status tests are new) |
| `npx vitest run --coverage` | **not re-measured** (the coverage plugin is not installed). Last measured 2026-10-03: 59.23% statements; the 117 new tests cover the paths F14 listed, so the figure will have risen. |
| `npx vue-tsc --noEmit` | clean (now also type-checks `tests/` and `gallery/`; `e2e/` is excluded because `@axe-core/playwright` carries its own `playwright-core`, as in `ui`) |
| `npm run lint` (stylelint, eslint + vuejs-accessibility + `suiBoundary`, html-validate) | clean |
| `npm run test:e2e` (Playwright + axe, Chromium, 70 tests: 7 states x 2 themes x 5 seasons) | **70 passed**; it found one real defect (the duplicate dialog's buttons took a mid-grey native background in the dark theme, 2.2:1) and it is fixed |
| `node .github/audit-gate.mjs` | 1 high advisory (`GHSA-vfj7-8cjw-p6xm`, braces, dev-only), allowlisted until 2027-01-01; 0 not allowlisted |
| `npm pack --dry-run` | 15 files: `src` (12 files), `CHANGELOG.md`, `SECURITY.md`, `README.md`, `LICENSE`, `package.json`; **no test files** (was 17 with 4 tests) |
| `npm run test:integration` (localnet) | **not run** (no localnet here). It now also reads the live `Gate` and `PlatformConfig` through access-gate-client, and no longer drives `useAccessGate`, which refuses a localnet package. |

The working tree was left clean (the untracked `docs/` directory holds this audit).

---

## Findings

### F1 — Max-tip clamp on the relay-reported tip

**Severity:** Medium (first pass)   **Disposition:** RESOLVED (re-verified 2026-10-03 and 2026-10-09; `relay.ts` is unchanged since `f6085e9`)

- `MAX_TIP_MIST` is now **0.005 SUI** (`relay.ts:16`, 0.1.32), the same workspace ceiling as walrus-client's
  default cap (D2 re-derived under D57: ≈ 8× the re-priced operator relay's worst-case tip). The first pass
  recorded 1 SUI; it was 0.05 SUI from the alignment until 0.1.31.
- `estimateTipMist` returns `null` above it (`:63-72`). Both `const` and `linear` modes are parsed.
- Tests:
  - `accepts a tip exactly at the ceiling`;
  - `clamps an absurdly large tip to null`;
  - `stays under the ceiling at the 100 MiB edge cap`.
- The display of `null` is F9.

### F2 — Negative tip rejected

**Severity:** Low   **Disposition:** RESOLVED (re-verified 2026-10-09)

`toMist` returns `null` for values below zero (`relay.ts:25-33`). Test: `rejects a negative tip`.

### F3 — Empty mainnet commission constants failed open

**Severity:** Medium (pre-mainnet)   **Disposition:** RESOLVED (superseded)

- The hardcoded `ACCESS_GATE_PACKAGE_ID` / `ACCESS_GATE_PLATFORM_CONFIG_ID` constants and
  `accessGateNftType` are gone.
- `relayGateConfig(network, input)` (`constants.ts:24-34`) takes the package, `PlatformConfig` and NFT
  type from `@meddleware/access-gate-client/deployments`.
- It throws when no deployment is recorded (mainnet today). Test: `refuses a network without a
  recorded deployment`.
- 2026-10-09: the deployment it reads is now the republished testnet `access_gate` `0xd7ddaa94…88c9`
  (access-gate-client 0.0.8, commit `182577a`, 0.1.29). The test `pins the package and
  PlatformConfig to the published deployment` compares against `accessGateDeployment` itself, so it
  follows the record.
- The prototype-key caveat (`access-gate-client-audit.md` F5) is closed: `accessGateDeployment` uses
  `Object.hasOwn` since access-gate-client 0.0.6 (installed 0.0.8).

### F4 — Injected hosts used without scheme validation

**Severity:** Low   **Disposition:** RESOLVED (re-verified 2026-10-09; residual edge cases in F12)

`requireHttpsHost` (`relay.ts:130-140`) guards:

- `probeRelay`;
- `walrusBlobUrl`;
- the operator health check (`useWalrusRelay.ts:77`).

### F5 — `walrusBlobUrl` did not encode the blob id

**Severity:** Low   **Disposition:** RESOLVED (re-verified 2026-10-09)

`encodeURIComponent(blobId)` (`relay.ts:146`). Test: `URL-encodes special characters in the blob id`.

### F6 — No runtime validation of injected interfaces

**Severity:** Info   **Disposition:** ADJUDICATED (by design; re-verified 2026-10-09)

- The library still trusts the app's `GateExecutor`, `performUpload`, `getClient`,
  `estimateStorageCost` and, since 0.1.28, the retry closures that walrus-client's errors carry
  (`getCertifyRetry`, `getUploadRetry`). The app is the trusted embedder.
- `PersonalMessageSigner` is no longer used here; it lives in walrus-client's `createGatedAccess`
  (which signs the audience-bound `nft-gate:access:v2` proof).
- One related gap: the app-supplied gate config is not checked (F10).

### F7 — Optimistic local `usesRemaining` decrement

**Severity:** Low   **Disposition:** RESOLVED (superseded; re-verified 2026-10-09)

- The consume step moved to `@meddleware/walrus-client/flow` (`createGatedAccess`).
- `useAccessGate` no longer decrements locally: `usesRemaining` is derived from the chain-read pass
  variant (`useAccessGate.ts:49-54, 104-108`).

### F8 — Positive: fail-closed ownership and most-depleted-first selection

**Severity:** Positive   **Disposition:** re-verified 2026-10-09, strengthened

- A failed `checkOwnership` sets `hasAccess = false` and clears `nftId` while keeping the purchase
  path (`useAccessGate.ts:110-117`).
- Exhausted passes are filtered out with access-gate-client's `isUsablePass`, and the most-depleted
  remaining single-use pass is chosen first, unlimited passes last (`:94-109`).
- New since the first pass:
  - a **generation counter** discards an ownership result that arrives after the wallet changed
    (`:65, 72, 87, 92, 111`);
  - `reset()` clears all wallet-derived state, including the pass variant.
- Tests:
  - `discards an ownership result that arrives after the wallet changed`;
  - `reset() clears access, uses and the held NFT`;
  - since 0.1.27: `ignores exhausted receipts, consumes the most-depleted single-use pass first and
    keeps unlimited last`; `has no access with only exhausted passes, and an unlimited pass only
    signs`.
- The old caveat (an unknown use count treated as unlimited) is closed by F15.

### F9 — `TipConfigBadge` shows "no tip" for an unknown, unparseable or over-ceiling tip; `probeRelay` throws despite "never throws"

**Severity:** Low   **Disposition:** RESOLVED (0.1.31, 2026-10-10; commit `24d7c43`) (was DEFERRED at 0.1.30)
**Where:** `src/components/TipConfigBadge.vue:27-30` (`tipLabel`); `src/lib/relay.ts:101-121`
(`probeRelay`, documented "Never throws", but `requireHttpsHost` throws before the `try`).

**Issue:**

- `probeRelay` returns `tip: null` when:
  - the tip config is malformed;
  - the tip exceeds `MAX_TIP_MIST` (the F1 clamp);
  - the response body is not JSON.
- `tipLabel()` renders every `null` as **"no tip"**. A genuine `no_tip` relay renders as
  `0.0000 SUI`.
- So a relay advertising an absurd tip (exactly what F1 guards against) is shown to users as free.
- `probeRelay` also rejects for a non-https host (a test asserts this). `refresh()` awaits it without
  a `catch`, so the badge stays on "Checking relay…" and the rejection is unhandled.

**Impact:**

- Misleading cost display. The SDK cap still bounds the real payment, but the user is not told.
- A stuck badge on misconfiguration.

**Remediation / evidence:**

1. Distinguish the outcomes in `RelayHealth`: `tip: bigint | null` plus
   `tipStatus: 'none' | 'known' | 'unknown' | 'over-ceiling'`.
2. Render "tip unknown" and "tip above limit" explicitly.
3. Make `probeRelay` honour its contract: validate inside the `try`, or update the doc.
4. Catch in `refresh()`.
5. Add component tests.

**Re-verification 2026-10-09:** `TipConfigBadge.vue:27-30` (`tipLabel` returns "no tip" for every
`null`), `relay.ts:106-108` (`requireHttpsHost` before the `try`) and `refresh()` (`:16-22`, no
`catch`) are unchanged since `f6085e9`; the test `rejects when host is not https://` still asserts
the throw. The mounted badge test is axe-only. The bounded payment (the SDK cap) is unchanged, so the
severity stays Low. The consumers pass fixed https hosts, so the stuck badge needs a misconfiguration.

**Resolution 2026-10-10 (0.1.31, commit `24d7c43`):**

- `RelayHealth` gains `tipStatus: 'none' | 'known' | 'unknown' | 'over-ceiling'` and `tipKind`; `describeTip` classifies a parsed schedule. `TipConfigBadge` shows "no tip" only for a relay that advertises `no_tip`, "tip 0.0001 SUI" (or "from …" for a linear schedule) for a known tip, "tip unknown" and "tip above the limit" otherwise, and "Relay address is not valid" for an invalid host. The unknown and above-limit states are drawn in the accent colour.
- `probeRelay` keeps throwing for a non-https host, and its doc now says so (a configuration error must not read as an outage); `TipConfigBadge.refresh()` catches it, shows the invalid state, and ignores an answer for a host that changed meanwhile.
- The cost line of `WalrusUpload` says "relay fee unknown" or "relay fee above the safety limit" instead of leaving the fee out (`useWalrusRelay().relayFeeStatus`).
- Tests: `tests/relay.test.ts` (`reports an over-ceiling tip as over-ceiling, not as no tip (F9)`, `reports a reachable relay with a malformed or non-JSON tip config as unknown (F9)`, `reports a genuine no_tip relay as none`, `describeTip`), `tests/badge-and-cta.test.ts` (each badge state, the invalid host, the stale answer), `tests/useWalrusRelay.test.ts` (`useWalrusRelay tip status (F9)`), `tests/walrus-upload.test.ts` (`cost line`). The badge states are in the contrast gate (F21).

### F10 — `useAccessGate` accepts any `RelayGateConfig`; commission pinning holds only through `relayGateConfig`

**Severity:** Low   **Disposition:** RESOLVED (0.1.31, 2026-10-10; commit `24d7c43`; OQ7 answered) (was DEFERRED at 0.1.30)
**Where:** `src/composables/useAccessGate.ts:13-15, 40-44` (`gate: RelayGateConfig | null`, a plain
structural interface); CLAUDE.md "Commission enforcement"; README; `SECURITY.md` invariant 1.

**Issue:**

- The documentation says an operator using this library "therefore routes through Meddleware's
  `PlatformConfig`".
- But `useAccessGate`, and so `buildPurchaseTx` and `buildConsumeTx`, accept any object with
  `packageId`, `platformConfigId`, `nftType`, `gateId`, `soulbound` and `priceMist`.
- An integrator can build the config by hand, for example to target their own `access_gate` publish
  with their own `PlatformConfig` and treasury, and use every widget unchanged.
- The two current consumers do use `relayGateConfig` (walrus-ui `config.ts:77`, token-deployer-ui).

**Impact:**

- The commission guarantee is a convention of the helper, not a property of the library's
  purchase path.
- On-chain the commission is always paid to whichever `PlatformConfig` the used package names, so
  this is a white-label and revenue question rather than a safety one.

**Remediation / evidence:**

- Either validate in `useAccessGate`: `packageId`, `platformConfigId` and the `nftType` original id
  must equal `accessGateDeployment(network)` for the network, which requires `network` in the deps.
- Or brand the type so only `relayGateConfig` can produce it (a unique-symbol nominal type).
- Then state the guarantee precisely in CLAUDE.md, README and `SECURITY.md`.
- Add tests.

**Re-verification 2026-10-09:** unchanged. `gate: RelayGateConfig | null` (`useAccessGate.ts:41`) is
still a structural interface and `relayGateConfig` (`constants.ts`) is still the only thing that
fixes the package. CLAUDE.md, README and AGENTS.md still say "any operator who uses this library
routes through Meddleware's `PlatformConfig`". The consumers (walrus-ui `config.ts:77`,
token-deployer-ui) still use `relayGateConfig`. The white-label policy
(`docs/audit/WHITE_LABEL_COMMISSION.md`) still describes the binding as hardcoded constants; the
mechanism is now `relayGateConfig`. Whether to enforce it in the composable is OQ7 and is the
maintainer's call.

**Resolution 2026-10-10 (0.1.31, commit `24d7c43`):** OQ7 had one best-practice answer once the other fix existed. The pinning to the published deployment is now a property of the purchase path, not of a helper.

- `useAccessGate({ network, gate, getClient })` runs `assertPinnedGate(network, gate)` at construction (`src/constants.ts`): the package, the `PlatformConfig` and the NFT type (normalised, at the original id, matching `soulbound`) must equal `accessGateDeployment(network)`, or it throws. A network with no recorded deployment throws (mainnet today) unless `gate` is `null` (an ungated relay needs no deployment). Because `buildPurchaseTx` and `buildConsumeTx` take their targets from the pinned config, nothing the library builds can target another package or `PlatformConfig`.
- CLAUDE.md, README, AGENTS.md and `SECURITY.md` state the guarantee precisely and without the economics (F23).
- Breaking (pre-v0.2): `network` is a new required dependency; consumers (walrus-ui, token-deployer-ui) pass it. A localnet gate cannot go through `useAccessGate` any more; the integration test reads the same objects through access-gate-client.
- Tests: `tests/constants.test.ts` (`assertPinnedGate (F10)`: accepts what `relayGateConfig` builds and unpadded ids; refuses a foreign package, a foreign `PlatformConfig`, an NFT type from another package, module or struct, a type that disagrees with `soulbound`, and a network with no deployment), `tests/useAccessGate.test.ts` (`pinning to the published deployment (F10)`).

### F11 — Purchase uses the app-configured price; the signing UX omits recipients, commission and paused state

**Severity:** Low   **Disposition:** RESOLVED (0.1.31, 2026-10-10; commit `24d7c43`; OQ8 answered) (was DEFERRED at 0.1.30)
**Where:**

- `src/composables/useAccessGate.ts:134` (`buildPurchaseTx(gate, gate.priceMist)`);
- `src/components/AccessGateCta.vue:13-26` (price from the prop, which comes from env);
- walrus-ui `config.ts` (`VITE_ACCESS_GATE_PRICE_MIST_{NET}`).

**Issue:** the price shown and split from gas is the operator's build-time value. The gate's on-chain
`price_mist`, `paused` flag and commission terms are never read, so:

- **On-chain price raised:** the purchase aborts (`E_INSUFFICIENT_PAYMENT`) after the wallet prompt,
  costing gas. The error is the raw abort; access-gate-client's `abortMessage` is not used.
- **On-chain price lowered:** the contract refunds the excess, but the CTA overstated the price.
- **Gate paused:** the purchase aborts.

The CTA also shows no payment recipient, platform commission or network (VUE lens §A *Signing UX*,
VUE-M4).

**Impact:** misleading prices; failed paid prompts; an incomplete pre-signature disclosure. No funds
are lost beyond gas, because the exact split aborts rather than overcharging.

**Remediation / evidence:**

1. Read the gate (`fetchGate`) and `PlatformConfig` (`fetchPlatformConfig`) when the gate is
   configured.
2. Use the on-chain price for both display and the split. Show the recipient, the commission
   (`gateCommissionMist`) and the network.
3. Block when the gate is paused.
4. Map aborts through `abortMessage(e, originalId)`.
5. Add tests.

**Re-verification 2026-10-09:** the purchase path is unchanged (`useAccessGate.ts:123-153`;
`AccessGateCta.vue` still takes `priceMist` as a prop and shows no recipient, commission or network).
The pieces are now available in access-gate-client 0.0.8 (`fetchGate`, `fetchPlatformConfig`,
`minimumPaidPriceMist`, `commissionForPrice`, `abortMessage(error, originalId)`), but this library
does not call them. Decision to carry (OQ8): whether the CTA reads the gate on-chain.

**Resolution 2026-10-10 (0.1.31, commit `24d7c43`):** OQ8 had one best-practice answer: the contract is the authority on price, recipients and share, and access-gate-client already has the reads.

- `useAccessGate` reads the `Gate` (`fetchGate`, parsed under the original id) and the `PlatformConfig` (`fetchPlatformConfig`) into `terms: PurchaseTerms` (`network`, `priceMist`, `operator {address, mist}`, `platform {address, mist}` from `gateCommissionMist`, `paused`, `soulbound`, `defaultUses`; operator + platform = price). It loads them when the ownership check finds no pass, and refuses a gate that is not a `Gate` of the pinned package or whose `soulbound` flag disagrees with the configured pass kind.
- `AccessGateCta` takes `terms` (and `termsError`, `purchaseError`) and shows the exact payment (`formatCoinExact`, no rounding), the operator and platform payees with their shares, the network and the pass kind, before the wallet opens. The button is disabled until the terms are read, and while the gate is paused. The platform's share is labelled "Platform fee" (OQ9).
- `purchase` reads the terms again right before signing and compares them with `terms` as last shown: a changed price, payee, share or pass, or terms never shown, publish the new terms and throw without a wallet prompt; a paused gate and an unreadable price throw likewise. The transaction is built with the on-chain price (`buildPurchaseTx(gate, terms.priceMist)`), so no overpayment relies on the refund. An `access_gate` abort is mapped through `abortMessage(e, originalId)`; other errors (a declined prompt) pass through. `purchaseError` carries the last failure.
- Breaking (pre-v0.2): `priceMist` is gone from `RelayGateConfig`, `relayGateConfig` and `AccessGateCta`; `getClient` must serve single-object reads (`GateClient`).
- Tests: `tests/useAccessGate.test.ts` (`purchase terms (F11)`, `purchase`: terms never shown, built from the on-chain price, price/recipient/fee changed, paused, unreadable, abort in words, foreign abort not claimed, retry loop and wait error), `tests/badge-and-cta.test.ts` (`AccessGateCta (F11)`), and the integration test (live `Gate` and `PlatformConfig` parse; not run here).

### F12 — Relay host validation and selection edge cases

**Severity:** Low   **Disposition:** RESOLVED (0.1.31, 2026-10-10; commit `24d7c43`) (was DEFERRED at 0.1.30)
**Where:** `src/composables/useWalrusRelay.ts:52-95, 123-130, 157-163`; `src/lib/relay.ts:130-140`.

**Issue:**

- **Fails open to the free relay.** `requireHttpsHost` runs inside the operator health check's
  `try`. A misconfigured `http://` operator host is therefore treated as **unreachable**, and the
  free public relay is offered. The anti-bypass policy fails open to the free relay instead of
  surfacing the misconfiguration.
- **Unvalidated hosts.** The **public** host, and the `selectedRelayHost` handed to `performUpload`,
  are never validated. walrus-client refuses to send a token over http, but an http public host would
  still receive the plaintext blob.
- **Loopback list.** `requireHttpsHost` treats only `localhost` and `127.0.0.1` as loopback, not
  `[::1]` as walrus-client does.
- **Configuration detection.** `isOperatorRelayConfigured = operator !== public` is a string compare:
  a trailing-slash or case variant of the same host counts as "configured".
- **One-shot health check.** It runs once, at mount. A transient failure offers the public relay for
  the rest of the session; an outage later keeps the operator relay selected, which fails closed.
- **Public tip assumed.** The public relay is labelled "free, no tip", and its estimate is 0, without
  probing its `/v1/tip-config`. The SDK cap still bounds any real tip.

**Impact:** revenue leakage on misconfiguration or transient errors; plaintext uploads to a
misconfigured public host; display inaccuracy. The anti-bypass policy is client-side revenue
steering, not access control (WAL-M3).

**Remediation / evidence:**

- Validate both hosts at construction and throw on a non-https, non-loopback host.
- Compare normalised origins.
- Re-probe on failure with backoff.
- Probe the public relay's tip config.
- Add `[::1]` to the loopback list.
- Add tests.

**Re-verification 2026-10-09:** `useWalrusRelay.ts` and `relay.ts` are unchanged since `f6085e9`
(`git diff f6085e9 HEAD` touches neither). The deployed apps inject fixed https hosts (the operator
relay behind the Workers gateway, the public Mysten relay), so the exposure is a misconfiguration
one. How the access proof is bound to the relay origin (audience-bound `nft-gate:access:v2` since
walrus-client 0.0.26) is audited in walrus-client.

**Resolution 2026-10-10 (0.1.31, commit `24d7c43`):**

- `useWalrusRelay` validates both hosts at construction with `requireHttpsHost` and throws (`operator relay host` / `public relay host`), so a misconfigured operator host no longer reads as "unreachable" and hands out the free relay. `requireHttpsHost` allows plain http only for the `http:` scheme on `localhost`, `127.0.0.1` and `[::1]`.
- Hosts are compared by origin (`relayOrigin`), so a trailing-slash or case variant of the same host is "no operator relay configured". Hosts given as a ref or getter are followed; an invalid later pair sets `configError`, offers no relay and shows a settings error in the widget instead of the pass prompt.
- A failed operator health check is re-checked with backoff (`HEALTH_RECHECK_DELAYS_MS`: 2, 5, 15, 30, 60 s, then it stands), cancelled by `stop()` or the owning scope; an operator relay that answered is not re-checked (an outage later keeps it selected, which fails closed). When it returns, an unpaid user still gets no relay (the paywall holds).
- The public relay's `/v1/tip-config` is read once per check; its label is "Public relay (fallback)" (it is no longer called free) and an unreadable tip is "unknown", never 0.
- The selected host handed to `performUpload` is always one of the validated pair.
- Tests: `tests/relay.test.ts` (`host validation`), `tests/useWalrusRelay.test.ts` (`host validation (F12)`, `re-checks a failed operator relay (F12)`, `tip status`), `tests/walrus-upload.test.ts` (`relay settings`).

### F13 — `SECURITY.md`, `package.json` description and UI copy are stale

**Severity:** Low (`SECURITY.md`) / Info (the rest)   **Disposition:** RESOLVED (0.1.31, 2026-10-10; commit `24d7c43`) (was DEFERRED at 0.1.30)
**Where:** `SECURITY.md:1-36`; `WalrusUpload.vue:462-466`; `package.json` `description`. (`README.md`, `AGENTS.md` and CLAUDE.md are current; see the re-verification.)

**`SECURITY.md`:**

- Invariant 1 describes the removed `ACCESS_GATE_PACKAGE_ID` / `ACCESS_GATE_PLATFORM_CONFIG_ID`
  constants.
- Scope and invariant 2 cite `@meddleware/nft-gate-client` and an injected `PersonalMessageSigner`.
- It says "the library builds no signing PTB itself". In fact it builds the purchase and consume PTBs
  through access-gate-client builders and submits the purchase through the injected executor.
- The scope omits `relayGateConfig`.

**`package.json` `description`:** "Built on @meddleware/walrus-client + @meddleware/nft-gate-client".
The package has no `nft-gate-client` dependency (its dependencies are access-gate-client,
walrus-client, ui and design-tokens), so the description should name access-gate-client. This is
the item the nft-gate-client audit flagged.

**UI copy:** "three wallet approvals (relay access, blob registration, blob certification)" is
inaccurate. Depending on the relay and pass:

| Case | Approvals |
| --- | --- |
| Open relay | 2 |
| Gated, unlimited pass | 3 (sign, register, certify) |
| Gated, single-use pass | 4 (consume, sign, register, certify) |

**Remediation / evidence:**

- Rewrite `SECURITY.md` around `relayGateConfig` (with F10's precise statement), access-gate-client
  and walrus-client.
- Correct the `package.json` description.
- Derive the approval count from the access mode.

**Re-verification 2026-10-09:** `SECURITY.md` is unchanged and still describes the removed
`ACCESS_GATE_PACKAGE_ID` / `ACCESS_GATE_PLATFORM_CONFIG_ID` constants, `nft-gate-client` and
`PersonalMessageSigner`. The UI hint still says "three wallet approvals (relay access, blob
registration, blob certification)" (`WalrusUpload.vue:465`). `package.json` `description` still
says "Built on @meddleware/walrus-client + @meddleware/nft-gate-client" although the dependency is
access-gate-client (`package.json` dependencies; `grep -rn nft-gate src tests README.md AGENTS.md`
finds nothing, so the description is the only stale mention). CLAUDE.md (0.1.27: `suiBoundary`, pass
`variant`), `README.md` (names access-gate-client, walrus-client `./flow` and `relayGateConfig`) and
`AGENTS.md` (`relayGateConfig`, access-gate-client `deployments`) are current. The second-pass
claim that `AGENTS.md` and the README were stale no longer holds. Only `SECURITY.md`, the
description and the UI copy remain. There is no `CHANGELOG.md` in this repo (the history is the git
log).
The approvals table below is unchanged; the new "Retry upload" path (F20) adds a fresh access proof
(a signature) on retry.

**Resolution 2026-10-10 (0.1.31, commit `24d7c43`):**

- `SECURITY.md` is rewritten around `relayGateConfig` and the pinning in `useAccessGate`, access-gate-client and walrus-client: seven invariants (pinned deployment, no wallet or WASM import with the PTBs built only through access-gate-client builders, terms seen before signing, untrusted relay, fail-safe selection, no cross-account leak, no secrets). It no longer cites `nft-gate-client`, `PersonalMessageSigner` or the removed constants, and is published (`files`).
- `package.json` `description` now reads "Built on @meddleware/walrus-client + @meddleware/access-gate-client".
- The approvals copy is derived from the access mode (`approvalsHint`): two on an open relay; three on a gated relay with an unlimited pass; four with a single-use pass; "three or four" when the app does not pass `RelayAccessOptions.singleUse`. Test: `tests/walrus-upload.test.ts` (`approvals copy (F13)`).
- README, AGENTS.md and CLAUDE.md are updated for the new API; `CHANGELOG.md` now exists.

### F14 — Coverage: the widget's money paths are untested

**Severity:** Low   **Disposition:** RESOLVED (0.1.31, 2026-10-10; commit `24d7c43`) (was DEFERRED at 0.1.30)
**Where:** coverage report (2026-10-03; not re-measured 2026-10-09).

| File | Statements | Untested paths |
| --- | --- | --- |
| `WalrusUpload.vue` | 28.48% | `upload()`, the duplicate dialog, `uploadAnyway`, `manageExisting`, the certify retry (`runPendingCertify`), **the upload retry (`runPendingUpload`, added in 0.1.28)**, the epochs clamp watcher, the permanence → `deletable` mapping, cost-line composition, `maxBytes` |
| `useWalrusRelay.ts` | — | `estimatedCost` (`158-174`) |
| `useAccessGate.ts` | — | `purchase`'s retry loop and wait-error paths |
| `upload-steps.ts` | — | `isUploadProgress` |

- The component tests are axe-only, at the initial file step.
- The first-pass C.1 noted "zero component tests"; axe tests were added since, but no behavioural
  ones.

**Impact:** regressions in what the user is charged or offered would ship unnoticed. Examples:
dropping `deletable`, or passing unclamped epochs.

**Remediation / evidence:** add mounted-component tests with a fake `performUpload` covering
duplicate, certify-retry, upload-retry, epochs and permanence; `estimatedCost` cases; the purchase
retry and wait error; and `isUploadProgress`.

**Re-verification 2026-10-09:** the suite is 44 tests (+2 pass-selection tests in 0.1.27); the three
component tests are still axe-only at the initial file step (`tests/components.test.ts:71-95`). The
2026-10-03 percentages were not re-measured (no coverage plugin installed). `WalrusUpload.vue` grew by
55 lines (the upload-retry path) with no test, so its figure will not have risen.

**Resolution 2026-10-10 (0.1.31, commit `24d7c43`):** 117 tests were added (44 to 161), mounted-component tests with a fake `performUpload` and the real relay composable over a stubbed `fetch` (only the two `@meddleware/ui` primitives are stand-ins, `tests/helpers/ui-stubs.ts`):

- `tests/walrus-upload.test.ts`: what is passed to the upload (bytes, relay host, epochs 1..53 clamp, Short/Max presets, permanence to `deletable`, `maxBytes`, no upload without a wallet, a plain failure); the cost line (storage in WAL following the epochs, relay fee, a stale storage estimate ignored, unknown / above-limit / no fee); the duplicate prompt (Extend, Certify, Upload a new copy with `force`, Cancel); the certify retry (success, declined again); the upload retry (success without a second `performUpload`, a new closure after a repeat failure, no further closure, hand-over to certify, cleared by a new upload); the approvals copy.
- `tests/useWalrusRelay.test.ts`: `estimatedCost` and `relayFeeStatus` cases. `tests/useAccessGate.test.ts`: the purchase retry loop and the wait error. `tests/components.test.ts` (axe) now also covers the prompt's states.
- A mutation check (the stale-result guard removed, `deletable` inverted) turns three of these tests red.
- `isUploadProgress` is still only exercised through the stepper path; coverage percentages were not re-measured (no coverage plugin).

### F15 — An unknown use count is treated as an unlimited pass

**Severity:** Info   **Disposition:** RESOLVED (0.1.27, `971ed8a`, 2026-10-08; re-verified 2026-10-09; tracked `access-gate-client-audit.md` F1, RESOLVED there in 0.0.5)
**Where (as found 2026-10-03):** `src/composables/useAccessGate.ts:88-97`; walrus-ui `WalrusView.vue:114`
(`singleUse: state.usesRemaining.value !== null`).

**Issue / Impact:**

- access-gate-client reported `usesRemaining: null` for an unlimited pass **and** for an
  unparseable count.
- This composable kept such passes as valid, sorted last.
- walrus-ui then derived `singleUse = false` from `null`, skipped the consume, and the single-use
  gateway rejected the upload with no clear cause.

**Remediation / evidence:**

- `useAccessGate` now holds the pass `variant` (`unlimited` | `singleUse` with an exact `bigint`
  `remaining`; `useAccessGate.ts:49-54`), filters with access-gate-client's `isUsablePass`, and
  exposes a new `singleUse` computed, so apps no longer infer it. `usesRemaining` is now
  `bigint | null` (breaking, pre-v0.2 policy: patch bump).
- access-gate-client's parser fails closed: an unknown tag or a count that is not a u64 is `null`, and
  such a pass is dropped before this composable sees it (`ownership.ts` `parseVariant`, in 0.0.8).
- Consumer: walrus-ui now passes `singleUse: state.singleUse.value` (`WalrusView.vue:118`).
- Tests: `ignores exhausted receipts, consumes the most-depleted single-use pass first and keeps
  unlimited last`; `has no access with only exhausted passes, and an unlimited pass only signs`;
  `reset() clears access, uses and the held NFT` now asserts `singleUse` is false.
- The test mock reimplements `isUsablePass`; the real function is covered in access-gate-client.

### F16 — Cross-account and cross-network state in the widget

**Severity:** Info   **Disposition:** RESOLVED (0.1.31, 2026-10-10; commit `24d7c43`) (was DEFERRED at 0.1.30)
**Where:**

- `useWalrusRelay(hosts, …)` copies `hosts.operator` / `hosts.public` at construction
  (`useWalrusRelay.ts:53-55`);
- `WalrusUpload.vue:89, 142, 148` (`bytes`, the `pendingCertify` and, since 0.1.28, `pendingUpload`
  closures);
- `useAccessGate({ getClient })` is not bound to the gate's network.

**Issue:**

- **Hosts are not reactive.** A network switch without a remount keeps the previous network's relay
  hosts and selection.
- **The certify and upload retries survive an account switch.** The `pendingCertify` and
  `pendingUpload` closures were built for the previous account's executor. wallet-adapter's executor
  refuses to sign after a switch, so this fails closed, but the prompt is stale. Both are cleared only
  when a new file is chosen or a new upload starts.
- **Wrong-network reads.** walrus-ui builds one `useAccessGate` per network but passes
  `getClient: () => getSuiClient()` (`WalrusView.vue:49-50`), which returns the *current* network's
  client. token-deployer-ui does not have this problem: `IconPicker.vue:37` passes
  `getClient: () => getReadClient(walrusNet)`, bound to the gate's network.

**Impact:** confusing failures; wrong-network reads in an embedding host. Funds are not at risk,
because executors and the chain check fail closed (VUE-M6).

**Remediation / evidence:**

- Accept `hosts` as a getter or ref.
- Clear `pendingCertify` and `bytes` on an account or network change (expose a `reset`).
- Take `network` in `useAccessGate` and pass it to `getClient(network)`.

**Resolution 2026-10-10 (0.1.31, commit `24d7c43`):**

- `useWalrusRelay` accepts `hosts` and `access` as a value, ref or getter and follows them: a new host pair clears the selection, tip configs and health state and re-checks; a stale probe answer is discarded (generation counter). `WalrusUpload` passes getters, so a network switch or another network's gate wiring is followed without a remount.
- `WalrusUpload` takes an optional `sessionKey`. A change of it, of the hosts, or a disconnect calls `resetSession()`: the file, the held certify and upload closures, the duplicate prompt and the error are dropped and the widget returns to the file step. An upload, certify retry or upload retry that finishes under an older session epoch reports nothing (no `uploaded`, no error, no retry offer) but still emits `settled`.
- `useAccessGate` takes `network` and calls `getClient(network)`, so a host that builds one gate state per network gets the matching client (walrus-ui's `getSuiClient()` problem); `reset()` also clears the terms.
- Residual: an app that does not pass `sessionKey` is not protected against an account switch inside a mounted widget (documented in the README and the prop docs); walrus-ui and token-deployer-ui should pass `${network}:${address}`.
- Tests: `tests/walrus-upload.test.ts` (`another account or network (F16)`: file and retries dropped on a session change, certify retry on a network change, a late result, failure, duplicate and retry ignored, disconnect, new hosts, new gate wiring), `tests/useWalrusRelay.test.ts` (`follows its inputs (F16)`), `tests/useAccessGate.test.ts` (`discards terms that arrive after a reset`, `passes the network to getClient`).

### F17 — Packaging, CI and style details

**Severity:** Info   **Disposition:** MITIGATED (0.1.31, 2026-10-10; commit `24d7c43`: test files, lint and `npm ci` done; the unpinned integration refs remain)

- **Test files are published.** `files: ["src"]` ships `src/**/*.test.ts` (4 files) to npm
  (`npm pack --dry-run` 2026-10-09: 17 files, 24.1 kB, 4 tests). **RESOLVED in 0.1.31** (moved to `tests/`; TS-M7, B.TS-1). Low impact: consumers compile only what `src/index.ts` imports.
- **Peer floor.** **RESOLVED in 0.1.27 (`971ed8a`).** The `@mysten/sui` peer floor is now `^2.33.2`
  (it matched the `@mysten/walrus` 1.2.32 chain), and `@mysten/walrus` `~1.2.32` is a peer too, so a
  host has one copy of each (`walrus-client-audit.md` F9). Installed: 2.35.0 and 1.2.34, one copy
  each (`npm ls --all`).
- **Publish verification.** `npm-publish.yml` uses `--if-present` and runs no lint (Node CI does run
  stylelint, eslint with a11y, and html-validate). **RESOLVED in 0.1.31** (the `verify` job runs lint and the contrast gate). The `verify` job does run `npm ci`, the
  audit gate, type-check and tests, and the npm client is pinned (`npm@11.20.0`, not `@latest`).
- **Integration CI.**
  - Sui CLI: **RESOLVED** in `614a25f` (2026-10-09): `testnet-v1.81.0` with a sha256 check of the
    installed binary (matches `Published.toml`). The `suiup` download is already checksummed.
  - `npm install`, not `npm ci` (`integration.yml:68`). **RESOLVED in 0.1.31** (`npm ci`).
  - `walrus-client` and `access-gate-sui` are checked out at `vars.*_REF || 'main'`, which is
    unpinned (`walrus-client-audit.md` F17). **Open.**
  - The localnet suite needs `.env.localnet`; it was not run here (no localnet in this environment).
- **Hardcoded colours.** ADJUDICATED. The scoped CSS uses hex fallbacks, for example
  `var(--border, #ded6cf)`. They equal the light-theme token values in `@meddleware/design-tokens`
  (checked: `--border`, `--lift`, `--muted`, `--ok`, `--danger`), added deliberately in `7d09209`
  so the widgets render if `tokens.css` is not imported. Contrast across themes is F21.
- **Duplicated constants.** ACCEPTED-RISK. `WALRUS_AGGREGATOR_HOSTS` and
  `MAX_SINGLE_RESERVATION_EPOCHS` duplicate walrus-client's. They are kept here deliberately, to avoid
  pulling the wasm chunk. walrus-client reads `max_epochs_ahead` live (53 fallback) and rejects an
  out-of-range `epochs` before any wallet prompt (0.0.26), so a stale constant here fails closed.
- **Dependabot.** Added in `fdbec17` (weekly, grouped npm minor/patch and actions). Merged tooling
  updates since: jsdom 30.1.2 and the npm-minor-patch group (`17b47d5`, `e49a95e`).

**Resolution 2026-10-10 (0.1.31, commit `24d7c43`):**

- **Test files are published.** RESOLVED: the four `src/**/*.test.ts` files moved to `tests/` (with the others); `npm pack --dry-run` lists no test, gallery or e2e file (15 files), and the publish workflow fails the tag if one would be packed. `tests/` and `gallery/` are now type-checked (`tsconfig.json`).
- **Publish verification.** RESOLVED: the `verify` job runs `npm run lint` and the Playwright contrast gate in addition to `npm ci`, the audit gate, type-check and tests; the npm client stays pinned.
- **Integration CI `npm install`.** RESOLVED: `npm ci`.
- **Integration refs.** Still open: `walrus-client` and `access-gate-sui` are checked out at `vars.*_REF || 'main'`. Pinning to a commit needs a choice of commit that walrus-client's own localnet pin also makes (`walrus-client-audit.md` F17); no single commit is right for both repos, so it is left to the maintainer rather than guessed. Recommendation: set `WALRUS_CLIENT_REF` and `ACCESS_GATE_REF` repository variables to the SHAs the last green localnet run used, and bump them with the dependency.
- `engines.node` is `>=24` (fleet decision D41; as nft-gate-client 0.0.17). The `CHANGELOG.md` and `SECURITY.md` ship in the tarball.

### F18 — Positive: selection policy, purchase guards, rendering and supply chain

**Severity:** Positive (re-verified 2026-10-09; `useWalrusRelay.ts` unchanged)

- **Anti-bypass relay selection** (`useWalrusRelay.ts:97-131`):
  - nothing is offered while the health check or the gate check is pending;
  - only the operator relay is offered when it is up and paid;
  - nothing is offered when it is up but unpaid (the purchase CTA is driven instead);
  - the public relay is offered only on a genuine fallback.
- **Tested both ways.** The policy is covered by two test files (`src/composables/useWalrusRelay.test.ts`,
  `tests/useWalrusRelay.test.ts`).
- **Purchase guards:**
  - a pending purchase blocks buying again for two minutes;
  - a wallet switch clears it;
  - an indexing lag is retried five times, and the wait error is surfaced only if ownership never
    appears.
  - Tests: `never buys a second pass while the first is still being indexed`;
    `a wallet switch clears a pending purchase`.
- **Upload widget UX:**
  - epochs clamped to [1, 53];
  - permanence an explicit, explained default (VUE-M5);
  - the duplicate precheck offers Extend or Certify instead of a paid duplicate;
  - a certify-only failure offers a gas-only retry;
  - a relay-upload failure after registration offers "Retry upload" on the same registration (F20);
  - the blocking progress dialog is a native `UiDialog` (inert page, kept focus, focus restored).
- **Rendering and styling:**
  - no `v-html`, no `innerHTML`, no dynamic `:href` / `:src` (VUE-M1);
  - prefixed, scoped CSS; no shell chrome (VUE-M9);
  - axe tests on all three components;
  - html-validate and a11y lint.
- **Chain access** only through access-gate-client (exact types, paged reads) and walrus-client
  `./flow` (SC-M10), now enforced by lint (F19).
- **Supply chain:**
  - an audit gate with a validated, **expiring** allowlist (one dev-only advisory, expires
    2027-01-01);
  - SHA-pinned actions; OIDC provenance (0.1.27 to 0.1.31 verified); tag == version; idempotent
    publish; Dependabot (weekly, grouped).

### F19 — Chain-access boundary enforced by lint (new 2026-10-09)

**Severity:** Info (hardening; the invariant already held by grep)   **Disposition:** RESOLVED (`112d0d3`, 2026-10-08, released in 0.1.27; ADR-0001 step B8)
**Where:** `eslint.config.ts` (last entry `...suiBoundary()` from `@meddleware/eslint-config` `^0.0.2`);
CLAUDE.md "No on-chain logic here".

**Issue:** "no inline on-chain logic" was a convention checked by grep (A3, A4). A later change could
have added a `moveCall`, a chain read or an unguarded URL binding without CI noticing.

**Remediation / evidence:**

- `suiBoundary()` forbids in `src/`: value imports of `@mysten/sui/{grpc,client,transactions}`
  (type-only imports allowed; `@mysten/sui/jsonRpc` banned), building transactions and chain reads,
  and URL bindings on native elements that do not go through `safeHref`, `safeIcon`,
  `suiExplorerUrl` or `walruscanBlobUrl`.
- `npm run lint` (stylelint, eslint + vuejs-accessibility + the boundary, html-validate) is clean at
  `e57b06e`, and Node CI runs all three linters. The only `@mysten/sui` import in `src` is
  `import type { Transaction }` (`useAccessGate.ts:2`).
- The localnet integration test imports `SuiGrpcClient`; it lives under `tests/`, outside the rule.
- There is no unit test of the rule here; it is tested in eslint-config.

**Note 2026-10-10:** `suiBoundary()` still passes at 0.1.31 (the new code imports only `normalizeSuiAddress` from `@mysten/sui/utils`, which the rule allows, and no transport). The rule is tested in eslint-config; this repo has no unit test of it, by design.

### F20 — Same-registration upload retry (new 2026-10-09)

**Severity:** Low (the gap it closes: a paid registration lost to a transient relay failure)   **Disposition:** RESOLVED (`7c446a2`, 2026-10-08, released in 0.1.28; depends on walrus-client 0.0.26). The behaviour is pinned by tests in this repo since 0.1.31 (F14).
**Where:** `src/components/WalrusUpload.vue` (`getUploadRetry` import, `pendingUpload`,
`runPendingUpload`, the "Retry upload" block in the options step).

**Issue:** `S4` of the second pass and the WAL-M8 baseline row noted that a failed relay upload cost
a second registration (walrus-client F7). The widget had only the certify retry.

**Remediation / evidence:**

- walrus-client 0.0.26 retries a failed upload on the same registration (up to 3 attempts, a fresh
  access proof each time) and, when attempts run out, throws an error carrying `getUploadRetry(err)`.
- The widget holds that closure (`pendingUpload`), shows "Your blob is registered and paid for, but
  the upload to the relay did not complete" with a **Retry upload** button, keeps the offer if the
  retry fails again, and hands over to the certify retry if the retry lands but certify fails. A new
  file or a new upload clears it.
- This is not a register resume: the library never resumes register. The relay embeds the tip and
  nonce in the register transaction and rejects a stale one ("too old"), so the retry works only within
  the relay's freshness window. walrus-client bounds it (`REGISTRATION_FRESH_MS`, 50 minutes inside the
  relay's one hour; test "does not retry once the registration is too old for the relay", per
  `walrus-client-audit.md`); after it the user uploads afresh, registering again. The widget shows no
  countdown (residual, Info; that bound is walrus-client's and was read there, not exercised here).
- Gaps at 0.1.30: no component test (F14); the pending closure survives an account switch (F16). Both closed in 0.1.31.

**Update 2026-10-10 (0.1.31, commit `24d7c43`):** the behaviour is now pinned by tests in `tests/walrus-upload.test.ts` (`same-registration upload retry (F20)`): the retry runs the app's closure and not `performUpload` again, a repeat failure keeps the offer on the new closure, a retry that lands but fails to certify hands over to the certify retry, and a held retry is dropped on a session change (F16). The gap noted above is closed.

### F21 — Colour contrast of the library's own compositions is not browser-checked (new 2026-10-09)

**Severity:** Info   **Disposition:** RESOLVED (0.1.31, 2026-10-10; commit `24d7c43`) (was DEFERRED at 0.1.30)
**Where:** the scoped CSS of `TipConfigBadge.vue`, `AccessGateCta.vue` and `WalrusUpload.vue`.

**Issue:** The VUE lens (2026-10-08) requires AA contrast in every theme x season combination,
checked in a real browser (axe) over a gallery with the real tokens. For this library:

- the colours are token roles (`--ok`, `--danger`, `--muted`, `--text`, `--lift`, `--border`,
  `--accent`), and `@meddleware/design-tokens` 0.1.9 measures every role pairing in every theme x
  season (`npm run check:contrast`, 4.5:1 text and 3:1 non-text);
- this library's own pairings (for example `--ok` or `--danger` text on the page surface, `--text` on
  `--lift`) are not named in that gate here, and the library's axe tests run in jsdom, which does not
  compute colour contrast. walrus-ui's Playwright e2e does not run axe.

**Impact:** a low-contrast state of the relay badge or the purchase prompt could ship in a theme not
tried. Cosmetic and accessibility, not a safety issue.

**Remediation / evidence:** include the three components in the browser axe gallery that checks
`ui`/`design-tokens` (or in walrus-ui's e2e), across all theme x season combinations; confirm the
link-in-text rule (the library renders no links in running text).

**Resolution 2026-10-10 (0.1.31, commit `24d7c43`):** copied the approach of `ui` (Playwright + `@axe-core/playwright` over a gallery built with the real tokens and seasons): `gallery/` (a Vite page rendering the three components in every state, with fixture relays), `e2e/contrast.spec.ts`, `playwright.config.ts`, `vite.gallery.config.ts`, `npm run test:e2e`, a Node CI job and a step in the publish `verify` job.

- 70 tests: relay badge (up, linear, no tip, unknown, above limit, unreachable, checking, invalid host), purchase prompt (terms, busy, loading, error, paused with a purchase error) and the upload widget (file, options, review, retry, certify, duplicate dialog, progress dialog), each in light and dark x no season, spring, summer, autumn, winter, with WCAG 2.2 AA and best-practice tags. All pass.
- It found one real defect: the duplicate dialog's buttons took Chromium's mid-grey native button background in the dark theme (2.2:1). They now set their own transparent surface and token text colours.
- The library renders no links in running text, so the link rule has nothing to check. The gate runs against `@meddleware/design-tokens` 0.1.10 (the four darker stops).

### F22 — Caller-keyed lookup and unbounded tip-config body (TS lens; new 2026-10-09)

**Severity:** Info   **Disposition:** RESOLVED (0.1.31, 2026-10-10; commit `24d7c43`) (was DEFERRED at 0.1.30)
**Where:** `src/lib/relay.ts:124-127, 143-147` (`WALRUS_AGGREGATOR_HOSTS[network]`);
`relay.ts:109-113` and `useWalrusRelay.ts:84` (`res.json()`).

**Issue:**

- **Caller-keyed lookup.** `walrusBlobUrl(network, …)` indexes a plain object with the caller's
  network name. The parameter is typed `WalrusNetwork`, but at runtime `'constructor'` resolves to
  `Object`; `requireHttpsHost` then throws "invalid URL", so it fails closed by accident. The TS lens
  expects `Object.hasOwn` or a `Map`. (`relayGateConfig` is fine: it goes through
  `accessGateDeployment`, which uses `Object.hasOwn` since access-gate-client 0.0.6.)
- **Unbounded body.** Both tip-config reads call `res.json()` with no size cap. The 3 s
  `AbortSignal.timeout` bounds time (it also covers the body read) but not memory, and the relay is
  untrusted. `parseTipConfig` itself is sound: it validates every field and builds fresh values with
  `BigInt`, never spreading the parsed object.

**Impact:** negligible in practice (typed callers, a 3 s timeout); a hygiene gap against TS-M2.

**Remediation / evidence:** guard the lookup with `Object.hasOwn`, read the tip-config as text with a
small byte cap before `JSON.parse`, and add a test for each.

**Resolution 2026-10-10 (0.1.31, commit `24d7c43`):** `walrusBlobUrl` looks the network up with `Object.hasOwn` and throws `unknown Walrus network` for `constructor`, `toString`, `__proto__` and the like. Both tip-config reads go through `fetchTipConfig`, which reads the body with `readBoundedJson` (a `content-length` check, then a streamed read that cancels at 16 KiB, `MAX_TIP_CONFIG_BYTES`); an oversized or non-JSON body is an unknown tip. Tests: `tests/relay.test.ts` (`bounded tip-config body (F22, TS-M2)`, including an endless stream that is stopped after a few chunks; `walrusBlobUrl network lookup (F22)`).

### F23 — Commission wording in `src` (placement rule; new 2026-10-09)

**Severity:** Info   **Disposition:** RESOLVED (0.1.31, 2026-10-10; commit `24d7c43`) (was DEFERRED at 0.1.30)
**Where:** `src/constants.ts:19` (doc comment: "routes the platform commission to Meddleware's
treasury").

**Issue:** `docs/audit/WHITE_LABEL_COMMISSION.md` says the commission model is documented only in the
audit docs and the public docs sites, not in any `repos/*/src`, with a grep guard on `commission` /
`white-label` economics language. This one comment matches. (CLAUDE.md, README and AGENTS.md in this
repo also discuss it; the rule names `src`.)

**Impact:** none on behaviour. The comment describes the mechanism, not the rates.

**Remediation / evidence:** reword the comment to "routes through Meddleware's `PlatformConfig`"
without the economics, or adjust the rule if the comment is acceptable. The maintainer decides which.

---

## Section A — Invariant verification matrix

| # | Invariant | Enforced at | Proven by | Status |
| --- | --- | --- | --- | --- |
| A1 | Gate-config IDs (package, `PlatformConfig`, NFT type) come only from the published deployment | `relayGateConfig` and `assertPinnedGate` in `useAccessGate` (`constants.ts`) | `pins the package and PlatformConfig to the published deployment`; `assertPinnedGate (F10)`; `pinning to the published deployment (F10)` | HOLDS — for the helper and for any config handed to `useAccessGate` (F10, 0.1.31) |
| A2 | Tip has an upper bound (display) and is enforced by the SDK (payment) | `MAX_TIP_MIST`; walrus-client `sendTip.max` | relay tests; badge tests | HOLDS — an unknown or above-ceiling tip is shown as such, never as no tip (F9, 0.1.31) |
| A3 | No `@mysten/walrus` import | grep | — | HOLDS |
| A4 | No wallet import | grep (executor injected) | — | HOLDS |
| A5 | No secrets | grep | — | HOLDS |
| A6 | Epochs clamped to [1, 53] | `WalrusUpload.vue` (`uploadEpochs` watcher) | `clamps the duration to [1, 53] and uses the clamped value` | HOLDS (F14) |
| A7 | Anti-bypass relay selection (client-side steering; access is enforced by the gateway) | `useWalrusRelay.ts` (`availableRelays`) | selection tests; `host validation (F12)`; `re-checks a failed operator relay` | HOLDS — an invalid host throws or offers nothing, not the free relay; a failed operator relay is re-checked (F12, 0.1.31) |
| A8 | Ships source, no build step | `exports` → `src/index.ts`; `files` | `npm pack --dry-run` (15 files, no tests); publish workflow check | HOLDS (F17, 0.1.31) |
| A9 | No XSS sinks | components | grep; html-validate | HOLDS |
| A10 | **Estimates labelled as estimates** (VUE) | cost line "Estimated"; badge | `cost line`; badge tests | HOLDS — the widget says "Estimated", the badge distinguishes none, a figure, unknown and above the limit (F9) |
| A11 | **Signing UX:** action, amount, recipients and network before each signature (VUE-M4) | `AccessGateCta` terms from the chain; `purchase` re-read; widget cost line and approvals hint | `AccessGateCta (F11)`; `purchase` tests; `approvals copy (F13)` | HOLDS for the purchase (exact payment, payees, shares, network, pass kind; no prompt for unseen terms). The upload's own prompts (registration, certify) are walrus-client's and the wallet's; the widget states the approval count and an estimate (F11, F13, 0.1.31) |
| A12 | **Shared-wallet state invalidated on switch** (VUE-M6) | `useAccessGate.reset()` + generation; `WalrusUpload.resetSession()` + session epoch; reactive hosts and gate wiring | wallet-switch tests; `another account or network (F16)` | HOLDS for the composable and the widget, given `sessionKey` (F16, 0.1.31) |
| A13 | **Permanent default, explicit** (WAL-M4, VUE-M5) | checkbox, default ticked | `uploads the chosen bytes … permanent by default`; `maps the permanence checkbox to deletable` | HOLDS (F14) |
| A14 | **Fail-closed ownership; usable passes only** | `checkOwnership`, `isUsablePass`, pass `variant` | tests (F8, F15) | HOLDS — an unknown or exhausted pass is not access (F15 RESOLVED, 0.1.27) |
| A15 | **Chain-access boundary** (ADR-0001, SC-M10): no inline PTB, chain read or unguarded URL sink in `src` | `suiBoundary()` in `eslint.config.ts`; `npm run lint` | lint in Node CI | HOLDS — enforced by lint since 0.1.27 (F19) |
| A16 | **A paid registration is not lost to a transient relay failure; register is never resumed** (WAL-M8) | `WalrusUpload.vue` `pendingUpload` / walrus-client `getUploadRetry` (50-minute bound) | walrus-client `tests/flow.test.ts`; `same-registration upload retry (F20)` here | HOLDS by design; the widget path is tested (F14, F20) |

---

## Section B — Supply-chain, publish-authority & capability matrix

### B.1 Dependency & CVE risk

`node .github/audit-gate.mjs`: 1 high advisory (braces, dev-only), allowlisted until 2027-01-01. The
production tree is clean.

| Dependency | Range (installed) | Liveness dependency? | Status | Notes |
| --- | --- | --- | --- | --- |
| `@meddleware/access-gate-client` | `^0.0.9` (0.0.9) | ownership reads; the gate and `PlatformConfig` reads; purchase and consume PTBs | provenance | its F1 / F5 are fixed (0.0.5 / 0.0.6) and resolve F15 / the F3 caveat here; 0.0.9 adds abort codes 15 and 16 and `validateGatePolicy` (this library builds no create-gate transaction, so only the abort table matters) |
| `@meddleware/walrus-client` | `^0.0.28` (0.0.28) | flow types and error helpers (`./flow`) | provenance | its F7 double-payment issue is fixed (0.0.26 same-registration retry) and surfaces as F20; 0.0.28 ships `.d.ts`, and its conflict helpers use nft-gate-client's vocabulary (not used here) |
| `@meddleware/ui` / `design-tokens` | `^0.1.31` / `^0.1.10` | UI | — | the contrast gate (F21) runs against the 0.1.10 tokens |
| `@playwright/test`, `@axe-core/playwright`, `vite` (dev) | `~1.63.0`, `~4.13.0`, `^8.3.4` | contrast gate (F21) | — | dev-only, as in `ui` |
| `@meddleware/eslint-config` (dev) | `^0.0.2` | lint (`suiBoundary`) | — | F19 |
| `@mysten/sui` (peer) | `^2.33.2` (2.35.0) | transactions (types only in `src`) | clean | floor aligned in 0.1.27 (F17) |
| `@mysten/walrus` (peer) | `~1.2.32` (1.2.34) | none imported; reaches the app through walrus-client | clean | peer so a host has one copy (F17) |
| `vue` (peer) | `^3.5.0` (3.5.43) | everything | clean | |
| Operator relay | app-injected | uploads; selection | — | fails over to the public relay and is re-checked with backoff (F12) |
| Public relay | app-injected | fallback | — | its tip is read, not assumed 0 (F12) |

**TS lens shared-dependency matrix row:**

| Package | dependency | devDependency | peer |
| --- | --- | --- | --- |
| `@mysten/sui` | — | `^2.33.2` | `^2.33.2` (F17, resolved) |
| `@mysten/walrus` | — | `~1.2.32` | `~1.2.32` |
| `vue` | — | `^3.5.40` | `^3.5.0` |
| `@meddleware/access-gate-client` | `^0.0.9` | — | — |
| `@meddleware/walrus-client` | `^0.0.28` | — | — |
| `@playwright/test` / `@axe-core/playwright` / `vite` | — | `~1.63.0` / `~4.13.0` / `^8.3.4` | — |
| `typescript` / `vitest` / `vue-tsc` | — | `~6.0.0` / `~5.0.2` / `~3.3.0` | — |

### B.2 Publish authority & CI

| Authority / secret | Where | Custody | Gates |
| --- | --- | --- | --- |
| npm publish `@meddleware/walrus-relay` | `npm-publish.yml` (tag `v*`) | OIDC trusted publisher; `--provenance` | releases |
| Gate-config IDs (package, `PlatformConfig`) | access-gate-client `deployments` (generated, provenance) | compile-time | checked by `assertPinnedGate` (F10) |

#### CI & release integrity

| Item | Holds? | Evidence |
| --- | --- | --- |
| Actions pinned | Yes | SHA pins in all three workflows |
| Least privilege | Yes | `contents: read`; `id-token: write` only on `publish-npm` |
| OIDC trusted publishing | Yes | SLSA v1 attestation on 0.1.27 to 0.1.31 (0.1.31 checked 2026-10-18) |
| Tag-gated, idempotent publish | Yes | `v*`; tag == version |
| Audit gate with expiring exceptions | Yes | `.github/audit-gate.mjs` + allowlist (`reason`, `expires` validated) |
| Lint and the contrast gate in publish verification | Yes | `npm-publish.yml` `verify` (F17, F21; 0.1.31) |
| No test or gallery file in the tarball | Yes | `npm-publish.yml` packed-files check (F17; 0.1.31) |
| `npm ci` in integration | Yes | `integration.yml` (F17; 0.1.31) |
| Sui CLI pinned and checksummed in integration | Yes | `614a25f`: `testnet-v1.81.0`, sha256 check (F17) |
| Integration refs pinned | No | `walrus-client` and `access-gate-sui` at `vars.*_REF \|\| 'main'` (F17) |

### B.WAL coupling (WALRUS lens)

| Format | Producer | Consumer | Test |
| --- | --- | --- | --- |
| `/v1/tip-config` (`no_tip`, `send_tip.kind.const`, `send_tip.kind.linear{base, encoded_size_mul_per_kib}`) | relay | `parseTipConfig` via `fetchTipConfig` (16 KiB cap) | relay tests (both modes, ceiling, negatives, garbage, oversized body) |
| `UploadProgress` / `ExistingCopy` / `certifyRetry` / `uploadRetry` | walrus-client `./flow` | `WalrusUpload` | `tests/walrus-upload.test.ts` attaches the errors with the real `attach*` helpers (F14) |
| Access proof `nft-gate:access:v2` (audience-bound) | walrus-client `createGatedAccess` / nft-gate-client | the operator relay's Worker gateway | not built here; paywall e2e PASS 2026-10-09 |

### B.SC-1 ID trace

| Location | Value | Source | Matches latest |
| --- | --- | --- | --- |
| `relayGateConfig`, `assertPinnedGate` | `publishedAt` / `platformConfigId` / original id (NFT type) | `accessGateDeployment(network)` | Y (access-gate-client 0.0.9 carries the 2026-10-09 testnet publication: `access_gate` `0xd7ddaa94…88c9`, `PlatformConfig` `0x3f81489d…e7b5`) |
| Gate id, soulbound | app env (`VITE_ACCESS_GATE_*_{NET}`); not in this library | operator | Y for the live gate `0x316f1bf9…faddc` (soulbound, 10 uses, 0.01 SUI); the soulbound flag is checked against the chain |
| Price, payees, pause | the `Gate` and `PlatformConfig` on the chain | `fetchGate`, `fetchPlatformConfig` | read live (F11); not configured |

---

## Section C — Test-coverage & hermetic/live split

### C.1 Coverage grade — B (161/161 at 2026-10-10; coverage percentages not re-measured: 59.23% statements, 41.49% branches were last measured 2026-10-03, before 117 tests covering the paths below)

| Dimension | Assessment |
| --- | --- |
| Happy path | Tip parsing, URLs, probe, selection matrix, `relayGateConfig`, wallet switch, pending purchase, the widget upload (options, epochs, permanence), `estimatedCost`, the purchase terms and the purchase. |
| Error path | Tip garbage, negatives, ceiling, oversized body, non-https hosts, unreachable relay and its re-check, stale ownership and terms, indexing lag, a changed or paused gate, an unreadable price, abort mapping, the duplicate prompt, the certify and upload retries, a stale result after a session change. |
| Boundary | Tip at the ceiling; the 100 MiB edge; epochs constant and the clamp watcher; `maxBytes`; prototype-key networks; unpadded ids. |
| Security-relevant | Anti-bypass, wallet switching, gate-config pinning (F10) and signing-UX disclosure (F11) are implemented and tested. Residual: the live-chain shape of the `Gate` read is tested against fixtures and, when the suite is run, the localnet integration test (not run here). |

**Test layers:**

| Layer | Files | In CI? |
| --- | --- | --- |
| Unit / composable | `tests/{relay,constants,useAccessGate,useWalrusRelay,useWalrusRelay.selection}.test.ts` | yes |
| Component (behaviour, jsdom) | `tests/walrus-upload.test.ts`, `tests/badge-and-cta.test.ts` | yes |
| Component (axe structure, jsdom) | `tests/components.test.ts` | yes |
| Real-browser contrast (Playwright + axe, theme x season) | `e2e/contrast.spec.ts` over `gallery/` (70 tests) | yes (`node-ci.yml` `e2e`, publish `verify`) |
| Localnet integration (real relay probe, access_gate ownership, the Gate and PlatformConfig reads) | `tests/integration/relay.integration.test.ts` | nightly and manual (`integration.yml`) |

### C.2 Hermetic vs. live paths

| Path | Hermetic? | Deferred to | Tracking |
| --- | --- | --- | --- |
| Tip parsing, selection policy, `relayGateConfig` | yes | — | — |
| Widget upload, duplicate, certify-retry and upload-retry flows | yes (mounted, fake `performUpload`) | the live e2e below covers the real flow | F14 |
| Purchase terms and purchase (price, pause, abort, changed terms) | yes against a fake client; the live `Gate` and `PlatformConfig` parse is in the localnet integration test (not run here) | the paywall e2e below | F11 |
| Gated upload end to end | no | the paywall e2e against the live dashboard (PASS 2026-10-09: pass bought on gate `0x316f1bf9…`, consumed, `nft-gate:access:v2` proof, upload through the Worker); token-deployer-ui `e2e:walrus` (PASS 2026-10-01) | — |

---

## Section D — Deployment-readiness gates

### pre-localnet

- [x] pure helpers and the selection policy tested; tip parsed for both modes and clamped (F1, F2)
- [x] hosts https-checked (F4), blob ids encoded (F5); no wasm or wallet imports; no XSS sinks
- [x] widget money paths tested (F14) — 0.1.31, commit `24d7c43`: 161 tests, the widget mounted with a fake
  `performUpload` (`tests/walrus-upload.test.ts`)

### pre-testnet *(in use on testnet; the items that were unmet at 0.1.30 are closed in 0.1.31)*

- [x] gate-config IDs from the published deployment via `relayGateConfig` (F3); live on the 2026-10-09
  `access_gate` `0xd7ddaa94…88c9` through access-gate-client 0.0.8 (0.0.9 in 0.1.31)
- [x] `npm ci` and the audit gate in Node CI and publish (the integration workflow uses `npm ci` since 0.1.31, F17)
- [x] no `VITE_*` read by the library; no secrets (A5)
- [x] gated upload proven end to end: paywall e2e PASS 2026-10-09 on the live dashboard (gate
  `0x316f1bf9…faddc`)
- [x] tip display distinguishes unknown from none (F9) — 0.1.31, commit `24d7c43`: `RelayHealth.tipStatus`,
  badge and cost line, `tests/relay.test.ts`, `tests/badge-and-cta.test.ts`
- [x] purchase uses on-chain price and pause state, with full disclosure (F11) — 0.1.31, commit `24d7c43`:
  `useAccessGate().terms`, `AccessGateCta`, `tests/useAccessGate.test.ts`
- [x] `SECURITY.md` current (F13) — 0.1.31, commit `24d7c43`

### pre-mainnet

- [ ] `access_gate` mainnet deployment recorded in access-gate-client (`relayGateConfig` throws until
  then) — mainnet-blocked
- [x] unknown use counts treated as unusable (F15: pass `variant`, `isUsablePass`, 0.1.27)
- [x] chain-access boundary enforced by lint (F19, 0.1.27) and the paid-upload retry on the same
  registration (F20, 0.1.28)
- [x] provenance on every release (0.1.27 to 0.1.31; 0.1.31 re-checked 2026-10-18) and Dependabot on (`fdbec17`)
- [x] gate-config pinning enforced at `useAccessGate` (F10, OQ7 answered) — 0.1.31, commit `24d7c43`:
  `assertPinnedGate`, `tests/constants.test.ts`, `tests/useAccessGate.test.ts`
- [x] operator and public host validation at construction (F12) — 0.1.31, commit `24d7c43`: `useWalrusRelay`
  throws for a non-https host; origin comparison; re-checks with backoff; public tip read
- [x] tip display distinguishes unknown from none (F9) — 0.1.31, commit `24d7c43`
- [x] purchase uses on-chain price and pause state, with full disclosure (F11, OQ8 answered) — 0.1.31, commit `24d7c43`
- [x] `SECURITY.md`, the `package.json` description and the approvals copy current; commission wording in
  `src` settled (F13, F23) — 0.1.31, commit `24d7c43`; the one wording question left is OQ9
- [x] widget money paths tested, including the upload retry (F14) — 0.1.31, commit `24d7c43`
- [x] widget state and hosts reset on account or network change (F16) — 0.1.31, commit `24d7c43`: `sessionKey`,
  reactive hosts and gate wiring, stale-result guard
- [x] browser-checked contrast of the three components in every theme x season (F21) — 0.1.31, commit `24d7c43`:
  `npm run test:e2e`, 70 tests, in Node CI and the publish `verify` job
- [x] untrusted-input parsing bounded: `Object.hasOwn` lookup, capped tip-config body (F22, TS-M2) — 0.1.31,
  commit `24d7c43`
- [x] test files out of the tarball; lint and `npm ci` in the release path (F17) — 0.1.31, commit `24d7c43` (the
  unpinned integration refs stay noted in F17)
- [ ] external review — maintainer item (`OPERATOR_TASKS.md` "Funding, grants and an external audit")

---

## Cross-project themes

- **Supply chain:** an expiring-allowlist audit gate (a model for the other repos); OIDC provenance;
  a source-shipping package compiled by consumers, so shipped test files mattered (F17, fixed in 0.1.31).
- **Wire-format coupling:** the relay `tip-config` schema (both modes tested); walrus-client `./flow`
  types.
- **On-chain-truth boundary:** prices and passes come from the chain, not env (F11, F15; 0.1.31). Relay
  selection is client-side steering; access is decided by the gateway and `access_gate`.
- **Chain-access layering (ADR-0001):** no inline `moveCall`; reads and builders come from
  access-gate-client; IDs from its generated `deployments`; upload conventions from walrus-client.
- **Pre-v0.2 policy:** patch-only bumps until go-live (breaking included). The F15 change
  (`usesRemaining` now `bigint | null`, new `singleUse`) shipped as 0.1.27 with walrus-ui bumped in
  step. The breaking changes of 0.1.31 (F9 `RelayHealth`, F10 `network` in deps, F11 no `priceMist`
  and `terms` for the prompt, F16 reactive hosts and `sessionKey`) ship the same way: walrus-ui and
  token-deployer-ui need a matching bump.
- **Register is never resumed:** the tip relay embeds the tip and a nonce in the register transaction
  and rejects a reused one ("too old"), so recovery is the bounded same-registration upload retry (F20)
  or a fresh register, never a resumed register.
- **Shared with sibling audits:**
  - access-gate-client F1 → F15;
  - access-gate-client F5 → F3 caveat;
  - walrus-client F7 (double payment; fixed in 0.0.26, surfaced here as F20) and F9 → F17;
  - walrus-client F17 → F17;
  - nft-gate-client audit note (the `package.json` description names `nft-gate-client`) → F13.

---

## Normative requirements (MUST / MUST NOT)

1. MUST NOT present an unknown or over-ceiling relay tip as "no tip" — **holds** (F9, 0.1.31).
2. MUST enforce the published deployment on every gate config the purchase path accepts —
   **holds** (F10, 0.1.31: `assertPinnedGate` in `useAccessGate`).
3. MUST show the on-chain price, recipients, platform share and network before the purchase signature,
   and block a paused gate — **holds** (F11, 0.1.31).
4. MUST validate operator and public relay hosts at construction rather than failing over silently —
   **holds** (F12, 0.1.31).
5. MUST keep `SECURITY.md` aligned with the shipped architecture — **holds** (F13, 0.1.31).
6. MUST NOT treat an unknown, unparseable or exhausted pass as access — **holds** (F15, 0.1.27).
7. MUST NOT resume a register, and MUST NOT re-register for a failed relay upload inside the relay's
   freshness window — **holds** (F20; walrus-client enforces the bound).
8. MUST keep on-chain logic out of `src` — **holds**, enforced by lint (F19).

**VUE lens baseline:**

| ID | Holds? | Evidence |
| --- | --- | --- |
| VUE-M1 | yes | A9 |
| VUE-M2 | yes (no `VITE_*` in the library; IDs from deployments; the live gate id is the app's env, public) | A1 |
| VUE-M3 | N/A (library; no test hooks in `src`) | — |
| VUE-M4 | yes (terms read from the chain and shown before the wallet opens; approvals copy derived) | F11, F13 |
| VUE-M5 | yes (permanent default, explained; no typed confirmation needed, a paid action is a deliberate click) | A13 |
| VUE-M6 | yes: composable and widget (with `sessionKey`); hosts and gate wiring follow their inputs | F16 |
| VUE-M7 | N/A (no storage here; the flow's storage is walrus-client's) | — |
| VUE-M8 | N/A (hosting is the apps') | — |
| VUE-M9 | yes | F18 |

**WALRUS lens baseline:**

| ID | Holds? | Evidence |
| --- | --- | --- |
| WAL-M1 | display ceiling yes; payment cap in walrus-client; both modes parsed | F1 |
| WAL-M3 | client-side steering only, stated here; an invalid host throws or offers nothing, a failed operator relay is re-checked; the gateway enforces access | F12 |
| WAL-M4 | yes | A6, A13 |
| WAL-M5 | via walrus-client | — |
| WAL-M6 | N/A | — |
| WAL-M7 | copy mentions costs, not publicity | Suggestion S3 |
| WAL-M2 | N/A (the library holds no relay credential; walrus-client attaches the proof to the relay origin) | — |
| WAL-M8 | holds: certify retry and, since 0.1.28, a bounded same-registration upload retry; register is never resumed (the relay rejects a reused register as "too old") | F20 |
| WAL-M9 | `maxBytes` is UX only (stated) | — |

**SUI_CLIENT lens baseline:**

| ID | Holds? | Evidence |
| --- | --- | --- |
| SC-M1 | yes (via `relayGateConfig`) | B.SC-1 |
| SC-M2 | yes (exact NFT type) | — |
| SC-M3 | yes: the executor throws on a failed transaction, the purchase awaits `waitForTransaction`, then re-reads ownership | F18 |
| SC-M4 | price as `bigint \| number` passed to `toU64`; `usesRemaining` an exact `bigint` | F15 |
| SC-M5 | per-network deployment; `getClient(network)` binds the client to the gate's network | F10, F16 |
| SC-M6 | N/A (no signature verification here; the proof is built in walrus-client and verified by the gateway) | — |
| SC-M7 | N/A (consume event binding is the gateway's and nft-gate-client's) | — |
| SC-M8 | yes (the library signs nothing; the injected executor executes the purchase) | — |
| SC-M9 | yes (passes are extracted by exact type in access-gate-client) | — |
| SC-M10 | yes, enforced by lint | F19 |

**TS lens baseline:**

| ID | Holds? | Evidence |
| --- | --- | --- |
| TS-M1 | yes (`vue-tsc`, `noUncheckedIndexedAccess`) | — |
| TS-M2 | yes: tip parsing, tip-config bodies capped at 16 KiB, `Object.hasOwn` lookup | F22 |
| TS-M3 | the price is a `bigint` read from the chain; no price is configured | F11 |
| TS-M4 | one deliberate swallow (unparseable tip-config), documented | — |
| TS-M5 | probe timeouts of 3 s | — |
| TS-M6 | yes | — |
| TS-M7 | yes: tests live in `tests/`; the tarball has none | F17 |
| TS-M8 | yes in Node CI, publish and integration (`npm ci`, audit gate with an expiring allowlist) | F17 |
| TS-M9 | yes: `@mysten/sui` and `@mysten/walrus` are peers (0.1.27), no `legacy-peer-deps`; the package ships `.ts` source, so types come with it | F17 |

## Implementation suggestions (SHOULD / MAY)

- **S1** SHOULD expose `singleUse` and an access mode from `useAccessGate`, so apps stop inferring
  them (F15). *(Done in 0.1.27: `singleUse` computed and the pass `variant`.)*
- **S2** SHOULD add a `useGateInfo` composable (on-chain price, paused, commission, recipient) for
  the CTA (F11). *(Done in 0.1.31 inside `useAccessGate`: `terms`, `loadTerms()`.)*
- **S3** SHOULD add a one-line note in the upload review: "Stored data is public on Walrus — encrypt
  sensitive files first (Sealed Storage)" (WAL-M7).
- **S4** MAY offer a "Retry upload" action once walrus-client exposes `uploadRetry` (walrus-client
  F7). *(Done in 0.1.28: F20.)*
- **S5** SHOULD adopt the audit-gate pattern (expiring allowlist) across the other repos.
- **S6** SHOULD name the three components in the browser axe gallery (F21) and fix the `package.json`
  description and `SECURITY.md` in the same patch (F13). *(Done in 0.1.31.)*

## Open questions (`OQ#`)

1. **OQ1** *(first pass)* Mainnet constant population.
   *(2026-10-03: superseded. IDs come from access-gate-client `deployments`; mainnet is populated
   when `access_gate` publishes there; `relayGateConfig` throws until then — F3.)*
2. **OQ2** *(first pass)* Is a UI-side tip clamp acceptable as defence in depth?
   *(Decided: yes. `MAX_TIP_MIST`, now aligned to 0.05 SUI — F1.)*
3. **OQ3** *(first pass)* What guarantees the app derives `gate.packageId` / `platformConfigId` from
   the constants? *(2026-10-03: partly answered by `relayGateConfig` — the package and
   `PlatformConfig` cannot be passed to it. Not enforced at `useAccessGate`; reopened as F10 / OQ7. **Decided 2026-10-10 (0.1.31):** enforced — `useAccessGate` runs `assertPinnedGate` against `accessGateDeployment(network)`, see OQ7 and F10.)*
4. **OQ4** *(first pass)* Pin `nft-gate-client` exactly?
   *(2026-10-03: superseded. PTBs come from access-gate-client, at `^0.0.8` then (`^0.0.9` in 0.1.31), which for a 0.0.x range
   admits only that one version; the version is bumped in step with each `access-gate-sui` publication.)*
5. **OQ5** *(first pass)* CI hardening (`npm ci`, audit)?
   *(Done in Node CI and publish, with the expiring-allowlist gate, and since 0.1.31 in the integration workflow too: `integration.yml` runs `npm ci` — F17; checked 2026-10-22.)*
6. **OQ6** *(first pass)* Re-check ownership instead of an optimistic decrement?
   *(2026-10-03: superseded. The decrement was removed and consume moved to walrus-client — F7.)*
7. **OQ7** *(new)* F10: enforce Meddleware's deployment inside `useAccessGate` (blocking white-label
   forks that use the widgets with their own `access_gate`), or document that commission pinning is
   a property of `relayGateConfig` only?
   *(2026-10-10: answered. Enforce it: `useAccessGate` checks the package, `PlatformConfig` and NFT type
   against `accessGateDeployment(network)` and throws (`assertPinnedGate`, 0.1.31). The commission itself
   was always enforced on-chain by the package's `PlatformConfig`; this makes the library's purchase path
   unable to target another package. White-label operators who run their own `access_gate` publish are not
   supported by these widgets; the placement rule and `WHITE_LABEL_COMMISSION.md` describe the binding as
   platform-fixed.)*
8. **OQ8** *(new)* F11: should the purchase flow read the gate on-chain (an extra RPC per mount), and
   should the CTA disclose the platform commission to buyers?
   *(2026-10-10: answered. Yes: the contract is the authority on price, payees and share, and
   access-gate-client already provides the reads (`fetchGate`, `fetchPlatformConfig`, `gateCommissionMist`,
   `abortMessage`). One extra read of two objects when the ownership check finds no pass, and one before the
   wallet opens (0.1.31). The prompt discloses the platform's share as an amount under the label "Platform
   fee"; see OQ9.)*
9. **OQ9** *(new, 2026-10-10; **decided 2026-10-18: option (a), keep the amounts**, and §4 of `WHITE_LABEL_COMMISSION.md` was amended — the purchase prompt is not documentation)* `WHITE_LABEL_COMMISSION.md` §4 says commission mechanics are not surfaced
   to end users beyond the plain "a small fee applies" framing. The purchase prompt (F11) now names the
   platform's payee address and its share of the price, read from the chain, because a signing prompt that
   omits a recipient of the payment is the gap VUE-M4 describes. Options: (a) keep the amounts (recommended:
   they are the facts the wallet will move, and the model itself, rates and rationale, stays in the
   documentation sites); (b) show one combined "fees" line without the payee; (c) show only "a small fee
   applies". The label already avoids the word "commission". Maintainer to confirm, and to update §4 of the
   document if (a) stands; the document's account of the binding ("hardcoded constants") is also now
   `relayGateConfig` plus `assertPinnedGate`.

## Risks

- **Revenue steering is client-side:** users can always use the public relay through other tools; the
  operator relay's gate is the only enforcement.
- **Stale configuration:** the gate id baked into app builds can diverge from the chain (the price no longer can, F11). A gate
  republish (as on 2026-10-09: `0xfd6c3b…` to `0x316f1bf9…`) is one coordinated release of the apps'
  `VITE_ACCESS_GATE_ID_{NET}` plus the access-gate-client bump; a stale app build points at a gate on
  the superseded package and finds no ownership.
- **Dependency inheritance:** this library inherits walrus-client's flow behaviour (the bounded
  same-registration retry, F20) and access-gate-client's parsing (fail-closed since 0.0.5, F15).
- **Source shipping:** consumers compile everything under `src`; since 0.1.31 that is no longer tests (F17).
- **Extra reads:** the prompt costs two object reads per mount and two before signing; a rate-limited node
  makes the terms unreadable and the purchase is refused (fail closed, with the reason shown).
- **No localnet through `useAccessGate`:** a localnet gate is refused by the pinning (F10); the integration
  test reads the same objects through access-gate-client.


**Resolution 2026-10-10 (0.1.31, commit `24d7c43`):** the placement rule (`WHITE_LABEL_COMMISSION.md`: the revenue model is documented only there and on the docs./dev. sites) has one reading, so it was applied. The `relayGateConfig` comment no longer says where the commission goes; CLAUDE.md ("Gate config pinning"), README, AGENTS.md and `SECURITY.md` describe the pinning mechanism without the economics; a comment in `useWalrusRelay.ts` no longer calls the tip revenue. `grep -ni "commission\|white-label\|treasury\|revenue" src gallery README.md CLAUDE.md AGENTS.md SECURITY.md package.json` now finds only the access-gate-client API name `gateCommissionMist` (imported under the alias `gatePlatformShareMist`) and the on-chain field name `platform.treasury`, which are identifiers of the domain client, not economics language. The purchase prompt shows the platform's share as an amount read from the chain under the label "Platform fee"; whether that is within `WHITE_LABEL_COMMISSION.md` §4 is OQ9.

---

## Re-verification log

- **2026-09-18** — first-pass baseline (corpus) at npm 0.1.12. F1–F8; OQ1–OQ6. F1, F2, F3, F4 and F5
  resolved inline that pass (per the corpus file).
- **2026-10-03** — second pass, relocated to the package repo, at `f6085e9` (tag `v0.1.26`, npm
  0.1.26 with provenance).
  - **Lenses:** AUDIT_TEMPLATE.md (2026-10-02) + VUE (2026-09-30) + WALRUS (2026-09-30) + SUI_CLIENT
    (2026-09-30) + TS (2026-10-03).
  - **Re-verified:** F1–F8. F3 and F7 are superseded by the access-gate-client and walrus-client
    migrations. F1's ceiling is aligned to 0.05 SUI. F8 is strengthened (generation guard). OQ1–OQ6
    answered in place.
  - **Measured:** vitest 42/42; coverage 59.23 / 41.49 / 60.52; `vue-tsc`, stylelint, eslint (a11y)
    and html-validate clean; audit gate 0 open (1 allowlisted, dev-only); `npm ls` clean; pack 17
    files (4 tests).
  - **New:** F9–F18; OQ7–OQ8.
  - **Not run:** the localnet integration suite (no testbed or egress).
  - **No findings resolved this pass:** by maintainer instruction this pass only records findings.
    Remediation, including single-solution fixes under the resolve-inline rule, is to be applied
    separately, with each disposition moved to RESOLVED and the diff cited.
- **2026-10-09** — third pass, aligned with the code at `e57b06e` (tag `v0.1.30`, npm 0.1.30 with
  provenance); no `CHANGELOG.md` exists in this repo, so the history is the git log.
  - **Lenses:** AUDIT_TEMPLATE.md (2026-10-08) + VUE (2026-10-08) + WALRUS (2026-09-30) + SUI_CLIENT
    (2026-10-08) + TS (2026-10-08); the other lenses are not triggered (reasons in the front matter).
  - **Resolved in code since the second pass:** F15 (0.1.27, `971ed8a`), plus the new F19 (lint boundary,
    `112d0d3`, 0.1.27) and F20 (same-registration upload retry, `7c446a2`, 0.1.28). F17: the peer floor
    (0.1.27) and the Sui CLI pin (`614a25f`).
  - **Facts corrected:** dependencies (access-gate-client 0.0.8, walrus-client 0.0.27, ui 0.1.31,
    design-tokens 0.1.9, eslint-config 0.0.2); the `access_gate` package `0xd7ddaa94…88c9` and
    `PlatformConfig` `0x3f81489d…e7b5` (republished 2026-10-09); the live relay gate `0x316f1bf9…faddc`
    (the library does not hard-code the gate; it is the app's `VITE_ACCESS_GATE_ID_{NET}`); proofs are
    `nft-gate:access:v2` and built outside this library; register is never resumed. F13: README and
    AGENTS.md are current (the second-pass claim was wrong); `SECURITY.md`, the `package.json`
    description (names `nft-gate-client`, which is not a dependency) and the approvals copy are stale.
    Sections A to D, the baselines, the open questions and the risks were brought up to date.
  - **New:** F19, F20 (resolved); F21, F22, F23 (deferred, Info).
  - **Measured:** vitest 44/44 (re-run); `vue-tsc`, lint and the audit gate clean; `npm ls` clean; pack 17
    files (4 tests); coverage not re-measured.
  - **Not fixed (no code changes in this pass):** F9–F14, F16, F21–F23 and the remainder of F17, each
    DEFERRED to a named Section D pre-mainnet gate.
  - **Not run:** the localnet integration suite (no localnet here).
- **2026-10-10** — fix wave, on top of `05f1963` (after `e57b06e`, tag `v0.1.30`); the code is 0.1.31, commit `24d7c43` (the orchestrator fills in the hash, tags and publishes).
  - **Dependencies bumped first:** `@meddleware/walrus-client` ^0.0.28, `@meddleware/access-gate-client` ^0.0.9,
    `@meddleware/design-tokens` ^0.1.10; the suite stayed green (44/44) before any change. Neither new walrus-client
    behaviour (declarations, `OwnedBlob.deletable`, conflict helpers) nor access-gate-client's create-gate
    guard touches this library.
  - **Resolved in code:** F9, F10 (OQ7), F11 (OQ8), F12, F13, F14, F16, F21, F22, F23; F17 except the integration
    refs (MITIGATED); F19 and F20 noted. `engines.node` `>=24`. New: OQ9 (a wording decision for the maintainer).
  - **Measured:** vitest 161/161 (8 files, was 44/6); `vue-tsc` (now including `tests/` and `gallery/`), `npm run
    lint` and the audit gate clean; `npm ci --dry-run` clean; Playwright + axe 70/70 (it found and fixed one dark-theme
    contrast defect in the duplicate dialog); `npm pack` 15 files, no tests. A mutation check (stale-result guard
    removed, `deletable` inverted) turned three widget tests red. Coverage percentages not re-measured.
  - **Not run:** the localnet integration suite (no localnet here); it was rewritten to read the live `Gate` and
    `PlatformConfig` through access-gate-client because `useAccessGate` refuses a localnet package.
  - **Left open:** the unpinned integration refs (F17, a maintainer choice of commit); OQ9; the `access_gate`
    mainnet deployment (mainnet-blocked); the external review (maintainer item).
  - **Consumers must follow (breaking, pre-v0.2 patch):** walrus-ui and token-deployer-ui pass `network` to
    `useAccessGate`, drop `priceMist` from `relayGateConfig` and the prompt, pass `terms` / `termsError` /
    `purchaseError` to `AccessGateCta`, pass `sessionKey`, and show `purchaseError`.
- **2026-10-18** — released (0.1.31), consumers bumped (walrus-ui and token-deployer-ui: `^0.1.31`, lockfiles resolve
  0.1.31). `npm view` shows `@meddleware/walrus-relay` 0.1.31 as `latest`, published 2026-10-18T09:00Z, with SLSA v1
  provenance (`dist.attestations`); tag `v0.1.31` = `2cf8b18` (code `24d7c43` + `4aa217d`). The "orchestrator fills in the hash, tags and
  publishes" and "consumers must follow" items of the 2026-10-10 entry are done. Its remaining dependency ranges: walrus-client
  `^0.0.28`, access-gate-client `^0.0.9`, design-tokens `^0.1.10`, ui `^0.1.31`; eslint-config is still `^0.0.2` (0.0.3 is out).
  Still open: the unpinned integration refs (F17), OQ9, the mainnet deployment and the external review. No Section D box waited
  only on the release.
- **2026-10-19** — live paywall run 2026-10-19: PASS — pass bought on the relay gate, consumed, v2 proof accepted, upload through the Worker, replay refused 409, strict decoder, indexer events; harness `integrations/paywall/` (infrastructure workspace).
  - Dependabot policy encoded in .github/dependabot.yml (majors declined); open PRs merged 2026-10-19
- 2026-10-19 — tip ceiling re-derived from the workspace cost model (`docs/economics/COST_MODEL.md`, D57):
  `MAX_TIP_MIST` 50_000_000n → 5_000_000n, matching walrus-client 0.0.29. The edge-cap test now uses the operator's
  new schedule (`100_000 + 1/KiB`) and pins the ceiling at 6–10× its worst-case tip. Version 0.1.32, commit pending;
  F1 text and the tip-ceiling lines updated. Measured with Node 26.12.0: type-check, lint (css, js, html), 161/161
  unit tests and the audit gate pass. No disposition changes.

- 2026-10-22 (audit close-out) — release status and stale open-question text; no code change.
  - Releases: 0.1.32 (`v0.1.32`, the tip ceiling, already described under F1) and 0.1.33 (`v0.1.33` = `d8a1412`; dependency bumps only: walrus-client `^0.0.30`, access-gate-client `^0.0.10`); npm `latest` 0.1.33 (read with `npm view`). The Deployment status gains the 0.1.33 line; the 0.1.32 "commit pending" is the tag.
  - OQ3 now records its answer (decided 2026-10-10: `useAccessGate` enforces the published deployment through `assertPinnedGate`, 0.1.31); OQ5 now records that `integration.yml` uses `npm ci` (`.github/workflows/integration.yml:68`, 0.1.31). Dispositions and counts unchanged.
  - Not re-run: the unit suite (the 0.1.33 commit's own CI); the live paywall path.

## Pre-save consistency checklist (this pass)

- [x] Section A ↔ findings: rows cite the findings that now hold (F9–F14, F16, F17); A11 no longer a GAP.
- [x] Finding header ↔ body: F1–F8 dispositions match their re-verification notes; F9–F14, F16, F20–F23 carry a 2026-10-10 resolution.
- [x] Template line: base + VUE + WALRUS + SUI_CLIENT + TS with dates; untriggered lenses named.
- [x] Closing four-part structure present; first-pass OQs kept with decisions recorded; OQ7 and OQ8 answered, OQ9 added.
- [x] Section D ↔ dispositions (only the mainnet deployment and the external review are unticked).
- [x] Executive summary ↔ dispositions and ceiling (realised Low; nothing open above Info).
- [x] C.1: test count re-run 2026-10-10 (161/161); coverage percentages are from 2026-10-03 and stated as such.
- [x] Re-verification log entry added.
- [x] 2026-10-22 (close-out): Deployment status, OQ3 and OQ5 text and the log updated; no disposition changes.
