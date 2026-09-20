# Security Policy

## Scope

This policy covers security issues in the `@meddleware/walrus-relay` package source (`src/**`) —
relay selection + tip estimation (`src/lib/relay.ts`), the access-gate composable, the tip/badge/
upload components, and the hardcoded commission-routing constants.

It does not cover:

- The first-party `@meddleware/*` dependencies it builds on (`nft-gate-client`, `walrus-client`,
  `ui`, `design-tokens` — see their own policies) or `@mysten/sui`
- The consuming app's injected wallet (`GateExecutor` / `PersonalMessageSigner`), Walrus client
  (`performUpload`), and relay hosts — the app is the trusted embedder
- The authoritative tip cap, which lives app-side in `createWalrusClient`
  (`VITE_UPLOAD_RELAY_MAX_TIP_MIST`)

## Security model (invariants)

These invariants are load-bearing. A report demonstrating that any is violated is in scope and
treated as high severity:

1. **Commission-routing constants are hardcoded and non-overridable.** `ACCESS_GATE_PACKAGE_ID` and
   `ACCESS_GATE_PLATFORM_CONFIG_ID` are compile-time constants with no env/param override; this is
   deliberate so purchases route commission on-chain through the platform config. They must be
   populated (and fail closed if empty) for the active network before use on that network.
2. **The library imports no wallet and no `@mysten/walrus` WASM.** Signing and upload are injected by
   the app; the library builds no signing PTB itself (they are delegated to `@meddleware/nft-gate-client`).
3. **A relay is untrusted.** Tip figures parsed from a relay's `/v1/tip-config` are display estimates;
   the authoritative spend cap is app-side. Relay-supplied strings are rendered as text (no `v-html`).
4. **Relay selection fails safe.** A gated, unpaid user is offered no relay (the public fallback is
   withheld while the operator relay is up); an unreachable operator relay falls back to public.
5. **No secrets.** The library holds no keys or tokens — only public object IDs and public `https`
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
