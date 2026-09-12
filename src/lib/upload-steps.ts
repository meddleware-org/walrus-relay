// Canonical, ordered step catalogue for a Walrus blob upload, shared by the app (which drives
// progress) and the `WalrusUpload` widget (which renders a stepper). Pure module — no Vue.
//
// The app reports progress through the `performUpload` `onStatus` callback. It may pass either a
// plain string (legacy: shown as a single status line) or an `UploadProgress` object (renders the
// stepped indicator). `detail` is the human sentence for the active step ("Registering blob
// (approve in wallet)…"); `step` positions it on the stepper.

/** Stable keys for each phase of an upload, in journey order. */
export type UploadStepKey = 'access' | 'encode' | 'register' | 'upload' | 'certify'

export interface UploadStepDef {
  key: UploadStepKey
  /** Short label under the stepper node. */
  label: string
  /** True when the step is a wallet approval (register/certify, and access for gated uploads). */
  signature?: boolean
}

/** Structured progress signal; preferred over a bare string so the widget can render a stepper. */
export interface UploadProgress {
  step: UploadStepKey
  /** Optional sentence shown beneath the stepper for the active step. */
  detail?: string
}

/** Core steps every upload performs (encode → register → upload → certify). */
export const CORE_UPLOAD_STEPS: readonly UploadStepDef[] = [
  { key: 'encode', label: 'Encode' },
  { key: 'register', label: 'Register', signature: true },
  { key: 'upload', label: 'Upload' },
  { key: 'certify', label: 'Certify', signature: true },
]

/** Gated uploads first spend one NFT use on-chain (a wallet approval) before the core steps. */
export const GATED_UPLOAD_STEPS: readonly UploadStepDef[] = [
  { key: 'access', label: 'Access', signature: true },
  ...CORE_UPLOAD_STEPS,
]

/** Narrow a status argument to a structured step (vs. a legacy bare string). */
export function isUploadProgress(s: string | UploadProgress): s is UploadProgress {
  return typeof s === 'object' && s !== null && 'step' in s
}
