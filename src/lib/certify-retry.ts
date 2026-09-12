// Convention for surfacing a "certify can be retried" affordance from a failed upload. Pure module.
//
// A Walrus upload is register → upload → certify. Register + upload are paid (storage reservation +
// relay tip) and cannot be replayed with a tip relay (the register tx ages out — see the "too old"
// note in walrus-ui). So if only CERTIFY fails (e.g. the user rejects the wallet prompt), the app's
// `performUpload` attaches a `certifyRetry` closure to the thrown error: the live upload flow still
// holds the storage-node certificate, so certify can be re-submitted without re-uploading or
// re-paying. Certify is a plain owner transaction on the user's own Blob object — no relay, no tip,
// validated on-chain — so retrying it introduces no new trust or replay surface.

/** Property name an app sets on a thrown upload error to expose a certify retry. */
const CERTIFY_RETRY_KEY = 'certifyRetry'

/** Shape of an error carrying a certify retry (generic over the app's upload-result type). */
export interface CertifyRetryable<R> {
  certifyRetry: () => Promise<R>
}

/** Attach a certify-retry closure to an error object (no-op for non-object throwables). */
export function attachCertifyRetry<R>(err: unknown, retry: () => Promise<R>): void {
  if (err && typeof err === 'object') {
    ;(err as Record<string, unknown>)[CERTIFY_RETRY_KEY] = retry
  }
}

/** Extract a certify-retry closure from a thrown error, or null if none was attached. */
export function getCertifyRetry<R>(err: unknown): (() => Promise<R>) | null {
  const c = (err as Partial<CertifyRetryable<R>> | null)?.certifyRetry
  return typeof c === 'function' ? c : null
}
