// Pure, framework-agnostic helpers for talking to a Walrus upload relay's
// `/v1/tip-config` endpoint. No Vue, no heavy deps — safe to import anywhere
// (unit-testable in isolation; shared by `useWalrusRelay` and `TipConfigBadge`).

/** A Walrus network. Walrus has no localnet — only testnet/mainnet exist. */
export type WalrusNetwork = 'testnet' | 'mainnet'

/**
 * Defense-in-depth ceiling on a relay-reported tip: 0.05 SUI. A relay is untrusted and could report
 * an absurd or negative tip via `/v1/tip-config`. The authoritative cap is the client's
 * `uploadRelayMaxTipMist` (the SDK refuses a larger tip); this library surfaces the tip only as an
 * estimate, so it clamps to the same workspace-wide ceiling. 0.05 SUI is ~8× the worst-case tip of
 * the operator's linear relay (`1_000_000 + 10/KiB`) at the 100 MiB edge cap, so no legitimate tip
 * is rejected. Tips beyond this — or negative — are treated as "unknown" (`null`).
 */
export const MAX_TIP_MIST = 50_000_000n

/** A relay's advertised tip schedule (MIST). */
export type RelayTipConfig =
  | { kind: 'none' }
  | { kind: 'const'; mist: bigint }
  | { kind: 'linear'; base: bigint; perKib: bigint }

/** Coerce a reported value to a non-negative bigint, or `null` if unparseable or negative. */
function toMist(v: unknown): bigint | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  try {
    const n = BigInt(v)
    return n < 0n ? null : n
  } catch {
    return null
  }
}

/**
 * Parse a `/v1/tip-config` response body into its tip schedule, or `null` if it is malformed.
 * Handles `"no_tip"`, `{ send_tip: { kind: { const: N } } }` and
 * `{ send_tip: { kind: { linear: { base, encoded_size_mul_per_kib } } } }`.
 */
export function parseTipConfig(data: unknown): RelayTipConfig | null {
  if (data === 'no_tip' || (data as { no_tip?: unknown } | null)?.no_tip !== undefined) {
    return { kind: 'none' }
  }
  const kind = (data as { send_tip?: { kind?: Record<string, unknown> } })?.send_tip?.kind
  if (!kind || typeof kind !== 'object') return null
  if (kind.const !== undefined && kind.const !== null) {
    const mist = toMist(kind.const)
    return mist === null ? null : { kind: 'const', mist }
  }
  const linear = kind.linear as { base?: unknown; encoded_size_mul_per_kib?: unknown } | undefined
  if (linear && typeof linear === 'object') {
    const base = toMist(linear.base)
    const perKib = toMist(linear.encoded_size_mul_per_kib ?? 0)
    return base === null || perKib === null ? null : { kind: 'linear', base, perKib }
  }
  return null
}

/**
 * Tip (MIST) the relay will charge for a blob whose ENCODED size is `encodedBytes`, or `null` if
 * it exceeds {@link MAX_TIP_MIST}. Without a size, a linear schedule yields its base (a floor).
 */
export function estimateTipMist(cfg: RelayTipConfig, encodedBytes?: number): bigint | null {
  let tip: bigint
  if (cfg.kind === 'none') tip = 0n
  else if (cfg.kind === 'const') tip = cfg.mist
  else {
    const kib = encodedBytes === undefined ? 0n : BigInt(Math.floor(Math.max(0, encodedBytes) / 1024))
    tip = cfg.base + cfg.perKib * kib
  }
  return tip > MAX_TIP_MIST ? null : tip
}

/**
 * Rough encoded size of a raw blob before `encode()` runs (UI estimates only): Walrus erasure
 * coding expands data ~5× and adds a fixed per-blob metadata overhead (~61 MiB on a 1000-shard
 * committee). The exact size is known only after encoding.
 */
export function approxEncodedBytes(rawBytes: number): number {
  return 61 * 1024 * 1024 + 5 * Math.max(0, rawBytes)
}

/**
 * Parse the relay tip (in MIST) from a `/v1/tip-config` response body. For a linear schedule pass
 * `encodedBytes` to include the size-dependent term; otherwise its base is returned. Returns `null`
 * when no tip can be determined or it exceeds {@link MAX_TIP_MIST}.
 */
export function parseTipFromConfig(data: unknown, encodedBytes?: number): bigint | null {
  const cfg = parseTipConfig(data)
  return cfg === null ? null : estimateTipMist(cfg, encodedBytes)
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

/** Throw unless `host` is an https URL (plain http is allowed for a localhost testbed only). */
export function requireHttpsHost(host: string, context: string): void {
  let url: URL
  try { url = new URL(host) } catch {
    throw new Error(`${context}: invalid URL: ${host}`)
  }
  // Allow HTTP for localhost testing only; production/remote hosts must use HTTPS.
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !isLocalhost) {
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
