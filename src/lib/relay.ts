// Pure, framework-agnostic helpers for talking to a Walrus upload relay's
// `/v1/tip-config` endpoint. No Vue, no heavy deps — safe to import anywhere
// (unit-testable in isolation; shared by `useWalrusRelay` and `TipConfigBadge`).

/** A Walrus network. Walrus has no localnet — only testnet/mainnet exist. */
export type WalrusNetwork = 'testnet' | 'mainnet'

/**
 * Defense-in-depth sanity ceiling on a relay-reported tip (1 SUI). A relay is untrusted and could
 * report an absurd or negative tip via `/v1/tip-config`; the authoritative cap lives app-side in
 * `createWalrusClient`'s `uploadRelayMaxTipMist`, but this library surfaces the tip as an estimate
 * with no app cap, so it must not present a hostile figure. This ceiling is calibrated against the
 * app's own default cap (walrus-ui defaults `uploadRelayMaxTipMist` to 0.5 SUI): it sits at 2× that
 * so it never rejects a tip the app legitimately permits, while still rejecting clearly-malicious
 * values (thousands of SUI). Tips beyond this — or negative — are treated as "unknown" (`null`).
 */
export const MAX_TIP_MIST = 1_000_000_000n

/** Coerce a reported tip value to a sane bigint, or `null` if it is unparseable, negative, or > cap. */
function sanitizeTip(v: string | number): bigint | null {
  let tip: bigint
  try {
    tip = BigInt(v)
  } catch {
    return null
  }
  if (tip < 0n || tip > MAX_TIP_MIST) return null
  return tip
}

/**
 * Parse the relay tip (in MIST) from a `/v1/tip-config` response body.
 *
 * The relay reports `send_tip.kind` as either `{ const: N }` (flat) or
 * `{ linear: { base, encoded_size_mul_per_kib } }` (size-scaled). For a
 * pre-encode estimate we use the flat const or the linear base; the exact
 * charge depends on the encoded size, known only after `encode()`.
 * Returns `null` when no tip can be determined, or when the reported tip is
 * negative or exceeds {@link MAX_TIP_MIST} (both treated as "no/unknown tip").
 */
export function parseTipFromConfig(data: unknown): bigint | null {
  const kind = (data as { send_tip?: { kind?: Record<string, unknown> } })?.send_tip?.kind
  if (!kind) return null
  if (kind.const !== undefined && kind.const !== null) {
    return sanitizeTip(kind.const as string | number)
  }
  const linear = kind.linear as { base?: unknown } | undefined
  if (linear?.base !== undefined && linear.base !== null) {
    return sanitizeTip(linear.base as string | number)
  }
  return null
}

/** Result of a relay health probe. */
export interface RelayHealth {
  /** Whether `/v1/tip-config` responded 200 within the timeout. */
  accessible: boolean
  /** Parsed tip in MIST (best-effort; `null` if unreachable or unparseable). */
  tip: bigint | null
}

/**
 * Probe a relay's `/v1/tip-config`. Never throws — a network error or non-200
 * resolves to `{ accessible: false, tip: null }` so callers can branch on the
 * result rather than catch. `timeoutMs` bounds the wait (default 3s).
 */
export async function probeRelay(host: string, timeoutMs = 3000): Promise<RelayHealth> {
  requireHttpsHost(host, 'probeRelay')
  try {
    const res = await fetch(`${host}/v1/tip-config`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return { accessible: false, tip: null }
    let tip: bigint | null = null
    try {
      tip = parseTipFromConfig(await res.json())
    } catch {
      // Reachable but unparseable tip — still "accessible"; tip stays null.
    }
    return { accessible: true, tip }
  } catch {
    return { accessible: false, tip: null }
  }
}

/** Aggregator hosts that serve a raw blob's bytes at `/v1/blobs/<blobId>`. */
export const WALRUS_AGGREGATOR_HOSTS: Record<WalrusNetwork, string> = {
  testnet: 'https://aggregator.walrus-testnet.walrus.space',
  mainnet: 'https://aggregator.walrus-mainnet.walrus.space',
}

function requireHttpsHost(host: string, context: string): void {
  let proto: string
  try { proto = new URL(host).protocol } catch { proto = '' }
  if (proto !== 'https:') {
    throw new Error(`${context}: host must use https://, got: ${host}`)
  }
}

/** Public URL that serves a RAW blob's bytes (renderable by wallets/explorers). */
export function walrusBlobUrl(network: WalrusNetwork, blobId: string, aggregatorHost?: string): string {
  const host = aggregatorHost ?? WALRUS_AGGREGATOR_HOSTS[network]
  requireHttpsHost(host, 'walrusBlobUrl')
  return `${host}/v1/blobs/${encodeURIComponent(blobId)}`
}

/**
 * Largest single `reserve_space` reservation Walrus accepts (`max_epochs_ahead`,
 * 53 on testnet/mainnet; ~2 years at the ~2-week epoch cadence). Kept here — a
 * light module with no `@mysten/walrus` import — so importing a widget never
 * pulls the Walrus wasm chunk into the eager bundle (see token-deployer
 * invariant #5). Longer retention needs `extendBlobLifetime` (operator step).
 */
export const MAX_SINGLE_RESERVATION_EPOCHS = 53

/**
 * Format a SUI/WAL base-unit amount (MIST / FROST, i.e. ×1e-9) for display. Uses 4 decimals for
 * normal amounts, but for a tiny NON-zero value shows enough significant digits instead of rounding
 * to `0.0000` — so a real-but-small relay tip (e.g. 10_000 MIST = 0.00001 SUI) isn't shown as zero.
 *
 * @param base Amount in the 1e-9 base unit (MIST for SUI, FROST for WAL).
 * @param symbol Ticker to append (e.g. `SUI`, `WAL`).
 */
export function formatCoinAmount(base: bigint, symbol: string): string {
  if (base === 0n) return `0 ${symbol}`
  const n = Number(base) / 1e9
  const s = n >= 0.0001 ? n.toFixed(4) : n.toFixed(9).replace(/0+$/, '').replace(/\.$/, '')
  return `${s} ${symbol}`
}
