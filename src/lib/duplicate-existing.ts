// Convention for surfacing "you already have this blob" from a failed/aborted upload. Pure module.
//
// With the tip relay every upload reserves fresh storage + registers + certifies, so re-uploading a
// file the wallet already has on-chain just creates a wasteful duplicate Blob object (and pays the
// relay tip again). Before registering, the app's `performUpload` checks for an existing owned copy
// of the same blobId and, if found, attaches the match to the thrown error so the generic widget can
// offer the correct action instead of blindly uploading:
//   - `certified`: the blob is already stored + available → offer Extend (prolong its lifetime).
//   - `pending`:   uploaded but not certified, and we still hold its certificate → offer Certify.
// Mirrors the `certify-retry.ts` error-carrying pattern so the widget stays app-agnostic.

/** An existing owned copy of the blob being uploaded. */
export interface ExistingCopy {
  /** `certified` ⇒ already available (offer Extend); `pending` ⇒ uploaded-not-certified (offer Certify). */
  kind: 'certified' | 'pending'
  /** The Walrus blob id (content-derived). */
  blobId: string
  /** The on-chain Blob object id of the existing copy. */
  objectId: string
  /** That copy's storage end epoch. */
  endEpoch: number
}

/** Property name an app sets on a thrown upload error to expose an existing-copy match. */
const DUPLICATE_EXISTING_KEY = 'duplicateExisting'

/** Shape of an error carrying an existing-copy match. */
export interface DuplicateExistingError {
  duplicateExisting: ExistingCopy
}

/** Attach an existing-copy match to an error object (no-op for non-object throwables). */
export function attachDuplicateExisting(err: unknown, existing: ExistingCopy): void {
  if (err && typeof err === 'object') {
    ;(err as Record<string, unknown>)[DUPLICATE_EXISTING_KEY] = existing
  }
}

/** Extract an existing-copy match from a thrown error, or null if none was attached. */
export function getDuplicateExisting(err: unknown): ExistingCopy | null {
  const e = (err as Partial<DuplicateExistingError> | null)?.duplicateExisting
  return e && typeof e === 'object' && 'kind' in e ? e : null
}
