// Pure, framework-agnostic helpers for talking to a Walrus upload relay's
// `/v1/tip-config` endpoint. No Vue, no heavy deps — safe to import anywhere
// (unit-testable in isolation; shared by `useWalrusRelay` and `TipConfigBadge`).

/** A Walrus network. Walrus has no localnet — only testnet/mainnet exist. */
export type WalrusNetwork = 'testnet' | 'mainnet'

/**
 * Parse the relay tip (in MIST) from a `/v1/tip-config` response body.
 *
 * The relay reports `send_tip.kind` as either `{ const: N }` (flat) or
 * `{ linear: { base, encoded_size_mul_per_kib } }` (size-scaled). For a
 * pre-encode estimate we use the flat const or the linear base; the exact
 * charge depends on the encoded size, known only after `encode()`.
 * Returns `null` when no tip can be determined (treated as "no/unknown tip").
 */
export function parseTipFromConfig(data: unknown): bigint | null {
  const kind = (data as { send_tip?: { kind?: Record<string, unknown> } })?.send_tip?.kind
  if (!kind) return null
  if (kind.const !== undefined && kind.const !== null) {
    try {
      return BigInt(kind.const as string | number)
    } catch {
      return null
    }
  }
  const linear = kind.linear as { base?: unknown } | undefined
  if (linear?.base !== undefined && linear.base !== null) {
    try {
      return BigInt(linear.base as string | number)
    } catch {
      return null
    }
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

/** Public URL that serves a RAW blob's bytes (renderable by wallets/explorers). */
export function walrusBlobUrl(network: WalrusNetwork, blobId: string, aggregatorHost?: string): string {
  const host = aggregatorHost ?? WALRUS_AGGREGATOR_HOSTS[network]
  return `${host}/v1/blobs/${blobId}`
}

/**
 * Largest single `reserve_space` reservation Walrus accepts (`max_epochs_ahead`,
 * 53 on testnet/mainnet; ~2 years at the ~2-week epoch cadence). Kept here — a
 * light module with no `@mysten/walrus` import — so importing a widget never
 * pulls the Walrus wasm chunk into the eager bundle (see token-deployer
 * invariant #5). Longer retention needs `extendBlobLifetime` (operator step).
 */
export const MAX_SINGLE_RESERVATION_EPOCHS = 53
