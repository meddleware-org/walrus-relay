// Pure, framework-agnostic helpers for talking to a Walrus upload relay's
// `/v1/tip-config` endpoint. No Vue, no heavy deps — safe to import anywhere
// (unit-testable in isolation; shared by `useWalrusRelay` and `TipConfigBadge`).

/** A Walrus network. Walrus has no localnet — only testnet/mainnet exist. */
export type WalrusNetwork = 'testnet' | 'mainnet'

/**
 * Defense-in-depth ceiling on a relay-reported tip: 0.005 SUI. A relay is untrusted and could report
 * an absurd or negative tip via `/v1/tip-config`. The authoritative cap is the client's
 * `uploadRelayMaxTipMist` (the SDK refuses a larger tip); this library surfaces the tip only as an
 * estimate, so it clamps to the same workspace-wide ceiling. 0.005 SUI is ~8× the worst-case tip of
 * the operator's linear relay (`100_000 + 1/KiB`) at the 100 MiB edge cap, so no legitimate tip
 * is rejected. Tips beyond this — or negative — are treated as "unknown" (`null`).
 */
export const MAX_TIP_MIST = 5_000_000n

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

/**
 * How a relay's tip reads, so the UI never shows an unknown tip as a free relay:
 * - `none`: the relay advertises no tip (`no_tip`);
 * - `known`: a tip schedule that parsed and is within {@link MAX_TIP_MIST};
 * - `unknown`: unreachable, not JSON, too large to read or not a recognised schedule;
 * - `over-ceiling`: a schedule that parsed but whose tip exceeds {@link MAX_TIP_MIST}.
 */
export type TipStatus = 'none' | 'known' | 'unknown' | 'over-ceiling'

/** Classify a parsed tip schedule (`null` when none could be read) for display. */
export function describeTip(
  cfg: RelayTipConfig | null,
  encodedBytes?: number,
): { tip: bigint | null; status: TipStatus } {
  if (cfg === null) return { tip: null, status: 'unknown' }
  const tip = estimateTipMist(cfg, encodedBytes)
  if (tip === null) return { tip: null, status: 'over-ceiling' }
  return { tip, status: cfg.kind === 'none' ? 'none' : 'known' }
}

/** Result of a relay health probe. */
export interface RelayHealth {
  /** Whether `/v1/tip-config` responded 200 within the timeout. */
  accessible: boolean
  /** Parsed tip in MIST (the base for a linear schedule); `null` unless `tipStatus` is `none` or `known`. */
  tip: bigint | null
  /** Why `tip` is or is not a number. `unknown` whenever the relay is unreachable. */
  tipStatus: TipStatus
  /** The shape of the advertised schedule; `null` when it could not be read. */
  tipKind: RelayTipConfig['kind'] | null
}

/** Largest `/v1/tip-config` body that is read. A real one is a few hundred bytes. */
export const MAX_TIP_CONFIG_BYTES = 16 * 1024

/**
 * Parse a response body as JSON without reading more than `maxBytes` of it: the relay is untrusted,
 * and a timeout bounds time but not memory.
 *
 * @throws {Error} if the body is larger than `maxBytes` or is not JSON.
 */
export async function readBoundedJson(res: Response, maxBytes = MAX_TIP_CONFIG_BYTES): Promise<unknown> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {})
    throw new Error(`response body is larger than ${maxBytes} bytes`)
  }
  let text: string
  if (res.body) {
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new Error(`response body is larger than ${maxBytes} bytes`)
      }
      chunks.push(value)
    }
    const all = new Uint8Array(total)
    let at = 0
    for (const c of chunks) {
      all.set(c, at)
      at += c.byteLength
    }
    text = new TextDecoder().decode(all)
  } else {
    text = await res.text()
    if (text.length > maxBytes) throw new Error(`response body is larger than ${maxBytes} bytes`)
  }
  return JSON.parse(text)
}

/** `host` without trailing slashes, so a path can be appended. */
function trimHost(host: string): string {
  return host.replace(/\/+$/, '')
}

/**
 * Read a relay's `/v1/tip-config`. Never throws: a network error, timeout or non-200 is
 * `{ accessible: false, config: null }`; a reachable relay whose body is not JSON, is too large or is
 * not a recognised schedule is `{ accessible: true, config: null }` (its tip is unknown, not zero).
 * `host` must already have been checked with {@link requireHttpsHost}.
 */
export async function fetchTipConfig(
  host: string,
  timeoutMs = 3000,
): Promise<{ accessible: boolean; config: RelayTipConfig | null }> {
  try {
    const res = await fetch(`${trimHost(host)}/v1/tip-config`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return { accessible: false, config: null }
    try {
      return { accessible: true, config: parseTipConfig(await readBoundedJson(res)) }
    } catch {
      // Reachable but unreadable (not JSON, or larger than the cap): the tip stays unknown.
      return { accessible: true, config: null }
    }
  } catch {
    return { accessible: false, config: null }
  }
}

/**
 * Probe a relay's `/v1/tip-config`. A network error or non-200 resolves to
 * `{ accessible: false, tip: null, tipStatus: 'unknown' }` so callers branch on the result instead
 * of catching; `timeoutMs` bounds the wait (default 3s).
 *
 * @throws {Error} if `host` is not an https URL (or loopback http): that is a configuration error,
 * not a relay outage, and must not read as "unreachable".
 */
export async function probeRelay(host: string, timeoutMs = 3000): Promise<RelayHealth> {
  requireHttpsHost(host, 'probeRelay')
  const { accessible, config } = await fetchTipConfig(host, timeoutMs)
  const { tip, status } = describeTip(config)
  return { accessible, tip, tipStatus: status, tipKind: config?.kind ?? null }
}

/** Aggregator hosts that serve a raw blob's bytes at `/v1/blobs/<blobId>`. */
export const WALRUS_AGGREGATOR_HOSTS: Record<WalrusNetwork, string> = {
  testnet: 'https://aggregator.walrus-testnet.walrus.space',
  mainnet: 'https://aggregator.walrus-mainnet.walrus.space',
}

/** Hosts that may be reached over plain http (a local testbed). `URL` renders IPv6 in brackets. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Throw unless `host` is an https URL (plain http is allowed for a loopback testbed only). */
export function requireHttpsHost(host: string, context: string): void {
  let url: URL
  try { url = new URL(host) } catch {
    throw new Error(`${context}: invalid URL: ${host}`)
  }
  // Production and remote hosts must use https; plain http only for loopback testing.
  const allowed = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
  if (!allowed) throw new Error(`${context}: host must use https://, got: ${host}`)
}

/** The lower-cased origin of an http(s) `host`, so `https://A.example/` and `https://a.example` compare equal. */
export function relayOrigin(host: string): string {
  return new URL(host).origin.toLowerCase()
}

/** Public URL that serves a RAW blob's bytes (renderable by wallets/explorers). */
export function walrusBlobUrl(network: WalrusNetwork, blobId: string, aggregatorHost?: string): string {
  let host = aggregatorHost
  if (host === undefined) {
    // `network` is caller-supplied: look it up as an own key, never through the prototype chain.
    if (!Object.hasOwn(WALRUS_AGGREGATOR_HOSTS, network)) throw new Error(`walrusBlobUrl: unknown Walrus network: ${String(network)}`)
    host = WALRUS_AGGREGATOR_HOSTS[network]
  }
  requireHttpsHost(host, 'walrusBlobUrl')
  return `${trimHost(host)}/v1/blobs/${encodeURIComponent(blobId)}`
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

/**
 * A SUI/WAL base-unit amount written exactly (no rounding): `10_000_001n` is `0.010000001 SUI`. Used
 * where the user approves a payment, so the figure shown is the figure paid.
 */
export function formatCoinExact(base: bigint, symbol: string): string {
  const whole = base / 1_000_000_000n
  const frac = (base % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '')
  return `${whole}${frac ? `.${frac}` : ''} ${symbol}`
}
