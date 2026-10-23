# Security Policy

## Scope

This policy covers security issues in the `@meddleware/walrus-storage-kit` package source (`src/**`) —
relay selection and tip estimation (`src/lib/relay.ts`, `useWalrusRelay`), the access-gate composable
(`useAccessGate`: ownership, the purchase terms and the purchase), `relayGateConfig`, and the
tip/badge/upload/purchase components.

It does not cover:

- The first-party `@meddleware/*` dependencies it builds on (`access-gate-client`, `walrus-storage-client`,
  `ui`, `design-tokens` — see their own policies) or `@mysten/sui`
- The consuming app's injected wallet executor (`GateExecutor`), Walrus client (`performUpload`), Sui
  client (`getClient`) and relay hosts — the app is the trusted embedder
- The authoritative tip cap, which lives app-side in `createWalrusClient`
  (`VITE_UPLOAD_RELAY_MAX_TIP_MIST`) and in walrus-storage-client
- Access proofs: they are built by `@meddleware/walrus-storage-client` (with `@meddleware/access-gate-gateway-client`) and
  verified by the gateway, not here

## Security model (invariants)

These invariants are load-bearing. A report demonstrating that any is violated is in scope and
treated as high severity:

1. **The gate config is the published deployment.** `relayGateConfig` takes the `access_gate`
   package and the `PlatformConfig` from `@meddleware/access-gate-client/deployments`, with no
   env/param override, and fails for a network with no recorded deployment. `useAccessGate` checks
   any config it is given against the same record (package, `PlatformConfig`, NFT type at the original
   id) and throws on a mismatch, so a hand-built config cannot redirect the purchase or consume
   transactions the library builds.
2. **The library imports no wallet and no `@mysten/walrus` WASM.** Signing and upload are injected by
   the app. It builds the purchase and consume transactions itself, only through
   `@meddleware/access-gate-client` builders (a lint rule, `suiBoundary()`, forbids inline
   transactions, chain reads and unguarded URL bindings in `src`), and submits the purchase through the
   injected `GateExecutor`.
3. **A purchase is signed only for terms the user has seen.** The price, the operator and platform
   payees and the platform's share are read from the `Gate` and `PlatformConfig` on the chain. The
   wallet is not asked to sign unless the terms read right before signing equal the terms last shown;
   a paused gate, an unreadable price or a changed term stops the purchase before any prompt. The
   payment is split from gas at exactly the on-chain price.
4. **A relay is untrusted.** Tip figures parsed from a relay's `/v1/tip-config` are display estimates;
   the authoritative spend cap is app-side. The body is read with a size cap, an unknown or
   above-ceiling tip is never shown as "no tip" or as free, and relay-supplied strings are rendered as
   text (no `v-html`).
5. **Relay selection fails safe.** A gated, unpaid user is offered no relay (the public fallback is
   withheld while the operator relay is up); an unreachable operator relay falls back to public and is
   re-checked; an invalid (non-https) host offers nothing instead of the free relay. This is a
   client-side policy, not access control; access itself is decided by the gateway.
6. **Wallet state does not leak across accounts or networks.** `useAccessGate.reset()` and a
   generation counter discard stale ownership and terms; `WalrusUpload` drops the chosen file and any
   held retry, and ignores the result of an upload that finishes after the session changed, when
   `sessionKey` changes.
7. **No secrets.** The library holds no keys or tokens — only public object IDs and public `https`
   hosts.

## Supported versions

Only the latest published npm version receives security fixes.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report vulnerabilities by emailing **<security@meddleware.co.uk>**. Include:

- A description of the vulnerability and its impact
- Steps to reproduce or a proof-of-concept (if available)
- The package version or commit SHA you tested against

You will receive an acknowledgement within **3 business days** and a resolution plan within
**14 days** for confirmed issues. Critical issues (CVSS ≥ 9.0) are prioritised for same-day
acknowledgement.

## Disclosure

Once a fix is released, a security advisory will be published on the GitHub repository. Reporters
may be credited by name unless they prefer to remain anonymous.
