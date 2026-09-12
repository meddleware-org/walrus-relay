<script setup lang="ts">
// Generic Walrus blob-upload widget. UI + orchestration only — the heavy
// `@mysten/walrus` client and the wallet live in the consuming app, injected via
// `performUpload`. This keeps `@meddleware/walrus-relay` free of wasm/wallet
// deps (preserving the lazy-load boundary) and wallet-agnostic. Relay selection +
// tip estimation come from `useWalrusRelay`.
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useWalrusRelay } from '../composables/useWalrusRelay.js'
import type { WalrusRelayHosts, RelayAccessOptions } from '../composables/useWalrusRelay.js'
import {
  CORE_UPLOAD_STEPS,
  GATED_UPLOAD_STEPS,
  isUploadProgress,
  type UploadProgress,
  type UploadStepKey,
} from '../lib/upload-steps.js'
import { getCertifyRetry } from '../lib/certify-retry.js'
import { getDuplicateExisting, type ExistingCopy } from '../lib/duplicate-existing.js'
import { MAX_SINGLE_RESERVATION_EPOCHS } from '../lib/relay.js'

export interface UploadResult {
  blobId: string
  /** Aggregator URL that serves the raw bytes. */
  url: string
  /** Certify tx digest, when the app exposes it. */
  digest?: string
}

const props = withDefaults(
  defineProps<{
    /** Relay host pair for the active network (operator + public fallback). */
    hosts: WalrusRelayHosts
    /** Whether a wallet is connected (gates the upload button). */
    connected: boolean
    /** Optional NFT-gate wiring (from `useAccessGate`). */
    access?: RelayAccessOptions
    /** File input accept filter. Default: any file. */
    accept?: string
    /** Optional UX-only size guard in bytes (the authoritative cap is the relay edge). */
    maxBytes?: number
    /**
     * App-provided upload. Receives the chosen bytes + upload options (selected relay host, chosen
     * storage duration in `epochs`, a `force` flag to bypass the duplicate precheck) and a status
     * callback; performs encode → register → upload → certify → getBlob using the app's Walrus
     * client + wallet, and resolves the blob result.
     *
     * `onStatus` accepts either a plain string (legacy — shown as a single status line) or an
     * `UploadProgress` (`{ step, detail }`), which drives the stepped progress indicator.
     */
    performUpload: (
      bytes: Uint8Array,
      opts: {
        relayHost: string
        epochs: number
        force?: boolean
        onStatus: (s: string | UploadProgress) => void
      },
    ) => Promise<UploadResult>
    /**
     * Estimate the on-chain storage cost (in WAL FROST, i.e. ×1e-9 WAL) of storing `sizeBytes` for
     * `epochs`. Injected by the app (it owns the Walrus client); when provided, the cost line shows a
     * storage figure alongside the relay fee. Returns `null` on a transient failure.
     */
    estimateStorageCost?: (sizeBytes: number, epochs: number) => Promise<bigint | null>
  }>(),
  { accept: '*/*', access: () => ({}) },
)

const emit = defineEmits<{
  (e: 'uploaded', result: UploadResult): void
  /** Fires once per upload attempt after it resolves — success OR failure. Lets the host
   *  refresh on-chain-derived views (owned blobs) since a failed UI run may still have landed. */
  (e: 'settled'): void
  /** The user chose to manage an existing copy (Extend a certified one / Certify a pending one)
   *  instead of uploading a duplicate. The host routes to its blob-management view. */
  (e: 'manage-existing', existing: ExistingCopy): void
}>()

/** Upper bound on a single reservation (Walrus `max_epochs_ahead`). */
const maxUploadEpochs = MAX_SINGLE_RESERVATION_EPOCHS

const { selectedRelayHost, availableRelays, estimatedCost, fileSizeBytes, checkOperatorRelayHealth } =
  useWalrusRelay(props.hosts, props.access)

const uploading = ref(false)
const status = ref('')
const error = ref<string | null>(null)
const fileName = ref('')
let bytes: Uint8Array | null = null

// Chosen storage reservation length (epochs). Defaults to the single-reservation max; clamped to
// [1, maxUploadEpochs]. Longer lifetimes are reached later via Extend (max_epochs_ahead caps a tx).
const uploadEpochs = ref(maxUploadEpochs)
watch(uploadEpochs, (v) => {
  const clamped = Math.min(maxUploadEpochs, Math.max(1, Math.floor(Number(v) || 1)))
  if (clamped !== v) uploadEpochs.value = clamped
})

// Estimated on-chain storage cost (WAL FROST) for the current file + duration; null while unknown.
const storageCostFrost = ref<bigint | null>(null)
let storageReqId = 0
async function refreshStorageCost(): Promise<void> {
  const size = fileSizeBytes.value
  const epochs = uploadEpochs.value
  if (!size || !epochs || !props.estimateStorageCost) {
    storageCostFrost.value = null
    return
  }
  const id = ++storageReqId
  try {
    const frost = await props.estimateStorageCost(size, epochs)
    if (id === storageReqId) storageCostFrost.value = frost
  } catch {
    if (id === storageReqId) storageCostFrost.value = null
  }
}
watch([fileSizeBytes, uploadEpochs], () => void refreshStorageCost(), { immediate: true })

/** MIST/FROST (1e-9) → a short decimal string. */
function to9dp(v: bigint): string {
  return (Number(v) / 1e9).toFixed(4)
}

/** Combined cost line: storage in WAL (scales with epochs) + relay fee in SUI (separate tokens). */
const costLine = computed<string | null>(() => {
  const relay = estimatedCost.value
  const storage = storageCostFrost.value
  const parts: string[] = []
  if (storage !== null) parts.push(`~${to9dp(storage)} WAL storage (${uploadEpochs.value} epochs)`)
  if (relay) parts.push(`~${to9dp(relay.mist)} SUI relay fee`)
  return parts.length ? `Estimated cost: ${parts.join(' + ')} (+ gas)` : null
})

// An existing owned copy of the file the user is trying to upload (from the app's precheck). When
// set, a choice dialog offers Extend/Certify instead of creating a wasteful duplicate.
const duplicate = ref<ExistingCopy | null>(null)

// When an upload lands but certify fails, the app attaches a retry closure to the error. We hold it
// so the user can certify the already-stored (already-paid) blob with one more approval — no
// re-upload. `certifying` tracks the retry in flight.
const pendingCertify = ref<(() => Promise<UploadResult>) | null>(null)
const certifying = ref(false)

// Stepped-progress state. `activeStep` is set only when the app reports structured progress; if it
// stays null (a legacy string-only caller), the modal falls back to the single status line.
const activeStep = ref<UploadStepKey | null>(null)
// A gated upload spends an NFT use first, so it has an extra leading "Access" node. We switch to the
// gated catalogue as soon as an `access` step is reported (the app only emits it when gating).
const sawAccessStep = ref(false)
const steps = computed(() => (sawAccessStep.value ? GATED_UPLOAD_STEPS : CORE_UPLOAD_STEPS))
const activeIndex = computed(() =>
  activeStep.value ? steps.value.findIndex((s) => s.key === activeStep.value) : -1,
)

/** Position of `key` relative to the active step: done | active | todo (for per-node styling). */
function stepState(index: number): 'done' | 'active' | 'todo' {
  if (activeIndex.value < 0) return 'todo'
  if (index < activeIndex.value) return 'done'
  if (index === activeIndex.value) return 'active'
  return 'todo'
}

function onProgress(s: string | UploadProgress): void {
  if (isUploadProgress(s)) {
    if (s.step === 'access') sawAccessStep.value = true
    activeStep.value = s.step
    status.value = s.detail ?? ''
  } else {
    status.value = s
  }
}

// Progress-modal focus management: trap focus in the dialog while uploading and restore it to the
// Upload button afterwards (accessible modal semantics for a blocking multi-step operation).
const dialogRef = ref<HTMLElement | null>(null)
const uploadBtnRef = ref<HTMLButtonElement | null>(null)

watch(uploading, async (isUploading) => {
  if (isUploading) {
    await nextTick()
    dialogRef.value?.focus()
  } else {
    uploadBtnRef.value?.focus()
  }
})

// Keep focus inside the dialog: it has no interactive controls while running, so swallow Tab.
function onDialogKeydown(e: KeyboardEvent): void {
  if (e.key === 'Tab') e.preventDefault()
}

onMounted(() => {
  checkOperatorRelayHealth()
})

// Gated + unpaid ⇒ no relay is available and upload is blocked until the user buys a pass.
const noRelayAvailable = computed(() => availableRelays.value.length === 0)

function onFile(e: Event): void {
  error.value = null
  pendingCertify.value = null
  duplicate.value = null
  bytes = null
  fileName.value = ''
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  if (props.maxBytes && f.size > props.maxBytes) {
    error.value = `File too large (max ${Math.round(props.maxBytes / 1024)} KB).`
    return
  }
  fileName.value = f.name
  fileSizeBytes.value = f.size
  const reader = new FileReader()
  reader.onload = () => {
    bytes = new Uint8Array(reader.result as ArrayBuffer)
  }
  reader.readAsArrayBuffer(f)
}

async function upload(force = false): Promise<void> {
  if (!bytes) {
    error.value = 'Choose a file first.'
    return
  }
  uploading.value = true
  error.value = null
  activeStep.value = null
  sawAccessStep.value = false
  pendingCertify.value = null
  duplicate.value = null
  try {
    const result = await props.performUpload(bytes, {
      relayHost: selectedRelayHost.value,
      epochs: uploadEpochs.value,
      force,
      onStatus: onProgress,
    })
    emit('uploaded', result)
  } catch (e) {
    // The app aborted before registering because the wallet already owns this blob: offer to manage
    // the existing copy (Extend / Certify) instead of paying to upload a duplicate.
    const existing = getDuplicateExisting(e)
    if (existing) {
      duplicate.value = existing
      return
    }
    // If the upload landed but only certify failed, offer a retry instead of a hard error — the
    // blob is already stored and paid for; certifying it later costs only the certify gas.
    const retry = getCertifyRetry<UploadResult>(e)
    if (retry) {
      pendingCertify.value = retry
    } else {
      error.value = e instanceof Error ? e.message : String(e)
    }
  } finally {
    // The transient step text only lives in the modal; the persistent "Uploaded ✓" is the
    // host's result section. Clear it as the modal closes so it never lingers.
    status.value = ''
    activeStep.value = null
    uploading.value = false
    emit('settled')
  }
}

/** User chose "Upload a new copy" in the duplicate dialog: re-run the upload, bypassing the check. */
function uploadAnyway(): void {
  duplicate.value = null
  void upload(true)
}

/** User chose "Extend it" / "Certify it": hand the existing copy to the host's blob-management view. */
function manageExisting(): void {
  const existing = duplicate.value
  duplicate.value = null
  if (existing) emit('manage-existing', existing)
}

/**
 * Retry certification of an already-uploaded blob (after a failed certify). Runs the app's retry
 * closure, which re-submits the certify transaction from the certificate the upload already
 * obtained — no re-upload, no relay, no extra fee beyond gas.
 */
async function runPendingCertify(): Promise<void> {
  const retry = pendingCertify.value
  if (!retry || certifying.value) return
  certifying.value = true
  error.value = null
  try {
    const result = await retry()
    pendingCertify.value = null
    emit('uploaded', result)
  } catch (e) {
    // Keep the pending state so the user can try again (e.g. they rejected the prompt once more).
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    certifying.value = false
    emit('settled')
  }
}
</script>

<template>
  <div class="wru-upload">
    <div class="wru-row">
      <input
        type="file"
        :accept="accept"
        aria-label="Choose a file to upload to Walrus"
        aria-describedby="wru-help"
        @change="onFile"
      />
      <button
        ref="uploadBtnRef"
        type="button"
        :disabled="uploading || !connected || !fileName || noRelayAvailable"
        @click="upload()"
      >
        <span v-if="uploading" class="wru-spinner" aria-hidden="true"></span>
        Upload to Walrus
      </button>
    </div>

    <p v-if="connected && noRelayAvailable" class="wru-gated" role="status">
      An access pass is required to upload through this relay — purchase one above to continue.
    </p>

    <fieldset v-if="fileName && availableRelays.length > 1" class="wru-relays">
      <legend>Upload relay</legend>
      <label v-for="option in availableRelays" :key="option.host" class="wru-relay-opt">
        <input
          type="radio"
          :value="option.host"
          :checked="selectedRelayHost === option.host"
          @change="(e) => (selectedRelayHost = (e.target as HTMLInputElement).value)"
        />
        <span>{{ option.label }}</span>
      </label>
    </fieldset>

    <div v-if="fileName" class="wru-duration">
      <label for="wru-epochs">Storage duration</label>
      <div class="wru-duration__controls">
        <input
          id="wru-epochs"
          v-model.number="uploadEpochs"
          type="number"
          min="1"
          :max="maxUploadEpochs"
          aria-describedby="wru-duration-help"
        />
        <span class="wru-duration__unit">epochs</span>
        <button type="button" class="wru-preset" @click="uploadEpochs = maxUploadEpochs">Max</button>
        <button
          type="button"
          class="wru-preset"
          @click="uploadEpochs = Math.min(10, maxUploadEpochs)"
        >
          Short
        </button>
      </div>
      <p id="wru-duration-help" class="wru-duration__help">
        Max {{ maxUploadEpochs }} epochs per upload; extend later from “My Blobs”.
      </p>
    </div>

    <p v-if="fileName && costLine" class="wru-cost">{{ costLine }}</p>

    <p id="wru-help" class="wru-hint">
      Requires <strong>WAL</strong> (storage) and <strong>SUI</strong> (gas + relay fee) in your
      wallet; three wallet approvals (relay access, blob registration, blob certification).
    </p>
    <!-- Upload landed but certification didn't (e.g. the wallet prompt was declined). The blob is
         already stored and paid for; offer a one-click certify rather than forcing a full re-upload. -->
    <div v-if="pendingCertify" class="wru-certify" role="status">
      <p class="wru-certify__msg">
        Your blob was uploaded and paid for but not yet <strong>certified</strong> — certify it to
        finish (one wallet approval, gas only; no re-upload).
      </p>
      <button type="button" :disabled="certifying" @click="runPendingCertify">
        <span v-if="certifying" class="wru-spinner" aria-hidden="true"></span>
        {{ certifying ? 'Certifying…' : 'Certify blob' }}
      </button>
    </div>

    <p v-if="error" class="wru-error" role="alert">{{ error }}</p>

    <Teleport to="body">
      <div v-if="uploading" class="wru-modal-backdrop">
        <div
          ref="dialogRef"
          class="wru-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wru-modal-title"
          tabindex="-1"
          @keydown="onDialogKeydown"
        >
          <h2 id="wru-modal-title" class="wru-modal__title">Uploading to Walrus…</h2>

          <!-- Stepped progress: a single horizontal line of nodes the upload walks through (the
               pulsing active node is the working indicator). Shown when the app reports structured
               progress; legacy string callers get just the status line below. -->
          <ol
            v-if="activeStep"
            class="wru-steps"
            :aria-label="`Step ${activeIndex + 1} of ${steps.length}`"
          >
            <li
              v-for="(s, i) in steps"
              :key="s.key"
              class="wru-step"
              :class="`is-${stepState(i)}`"
              :aria-current="stepState(i) === 'active' ? 'step' : undefined"
            >
              <span class="wru-step__node" aria-hidden="true">
                <span v-if="stepState(i) === 'done'" class="wru-step__check">✓</span>
                <span v-else-if="stepState(i) === 'active'" class="wru-step__pulse"></span>
              </span>
              <span class="wru-step__label">{{ s.label }}</span>
            </li>
          </ol>

          <p class="wru-modal__status" aria-live="polite">{{ status || 'Preparing…' }}</p>
          <p class="wru-modal__hint">Keep this tab open and approve the wallet prompts.</p>
        </div>
      </div>
    </Teleport>

    <!-- You already own this blob: offer to manage the existing copy instead of paying for a
         duplicate. Copy + primary action adapt to whether it's certified (Extend) or pending (Certify). -->
    <Teleport to="body">
      <div v-if="duplicate" class="wru-modal-backdrop">
        <div class="wru-modal" role="dialog" aria-modal="true" aria-labelledby="wru-dup-title">
          <h2 id="wru-dup-title" class="wru-modal__title">You already have this blob</h2>
          <p class="wru-modal__status">
            <template v-if="duplicate.kind === 'certified'">
              It's already stored and available until epoch {{ duplicate.endEpoch }}. Uploading again
              creates a duplicate and charges the relay fee again — extend its lifetime instead.
            </template>
            <template v-else>
              You already uploaded this but haven't certified it yet. Finish certifying it instead of
              paying to upload again.
            </template>
          </p>
          <div class="wru-dup__actions">
            <button type="button" class="wru-dup__primary" @click="manageExisting">
              {{ duplicate.kind === 'certified' ? 'Extend it' : 'Certify it' }}
            </button>
            <button type="button" @click="uploadAnyway">Upload a new copy</button>
            <button type="button" class="wru-dup__cancel" @click="duplicate = null">Cancel</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.wru-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.wru-relays {
  margin: 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.wru-relay-opt {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.wru-cost,
.wru-hint {
  margin: 0.5rem 0;
  font-size: 0.9rem;
  color: var(--mw-color-text-muted, #666);
}
.wru-error {
  margin: 0.5rem 0;
  color: var(--mw-color-danger, #b00020);
}
.wru-certify {
  margin: 0.75rem 0;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--accent, #6366f1);
  border-radius: var(--mw-radius, 8px);
  background: color-mix(in srgb, var(--accent, #6366f1) 8%, transparent);
}
.wru-certify__msg {
  margin: 0 0 0.6rem;
  font-size: 0.9rem;
}
.wru-duration {
  margin: 0.75rem 0;
}
.wru-duration > label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.35rem;
}
.wru-duration__controls {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.wru-duration__controls input {
  width: 5rem;
}
.wru-duration__unit {
  font-size: 0.85rem;
  color: var(--mw-color-text-muted, #888);
}
.wru-preset {
  font-size: 0.8rem;
  padding: 0.15rem 0.5rem;
}
.wru-duration__help {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: var(--mw-color-text-muted, #888);
}
.wru-dup__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 1.1rem;
}
.wru-dup__primary {
  border-color: var(--accent, #6366f1);
  color: var(--accent, #6366f1);
}
.wru-dup__cancel {
  color: var(--mw-color-text-muted, #888);
}
.wru-gated {
  margin: 0.5rem 0;
  font-size: 0.9rem;
  color: var(--accent, #6366f1);
}
.wru-spinner {
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  margin-right: 0.4em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: wru-spin 0.7s linear infinite;
  vertical-align: -0.1em;
}
@keyframes wru-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Progress modal ─────────────────────────────────────────────────────────── */
.wru-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: color-mix(in srgb, #000 62%, transparent);
  backdrop-filter: blur(2px);
}
.wru-modal {
  width: min(24rem, 100%);
  padding: 1.75rem 1.5rem;
  border-radius: var(--mw-radius, 12px);
  background: var(--surface, #1b1b1f);
  color: var(--text, #f0f0f0);
  border: 1px solid var(--border, #333);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  text-align: center;
}
.wru-modal:focus {
  outline: none;
}
.wru-modal__title {
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
  font-weight: 600;
}
.wru-modal__status {
  margin: 0;
  font-size: 0.95rem;
  color: var(--text, #f0f0f0);
  min-height: 1.4em;
}
.wru-modal__hint {
  margin: 0.6rem 0 0;
  font-size: 0.8rem;
  color: var(--muted, #888);
}

/* ── Stepped progress ───────────────────────────────────────────────────────── */
.wru-steps {
  display: flex;
  list-style: none;
  margin: 1.1rem 0 0.9rem;
  padding: 0;
}
.wru-step {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  position: relative;
  min-width: 0;
}
/* Connecting line: the segment entering each node (from the previous one). Accent once reached. */
.wru-step:not(:first-child)::before {
  content: '';
  position: absolute;
  top: 0.6rem; /* vertical centre of the 1.2rem node */
  right: 50%;
  left: -50%;
  height: 2px;
  background: var(--border, #3a3a40);
  z-index: 0;
}
.wru-step.is-done::before,
.wru-step.is-active::before {
  background: var(--accent, #6366f1);
}
.wru-step__node {
  position: relative;
  z-index: 1;
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface, #1b1b1f);
  border: 2px solid var(--border, #3a3a40);
  color: #fff;
  font-size: 0.7rem;
  line-height: 1;
  transition: border-color 0.2s, background-color 0.2s;
}
.wru-step.is-done .wru-step__node {
  background: var(--accent, #6366f1);
  border-color: var(--accent, #6366f1);
}
.wru-step.is-active .wru-step__node {
  border-color: var(--accent, #6366f1);
}
.wru-step__pulse {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--accent, #6366f1);
  animation: wru-pulse 1s ease-in-out infinite;
}
.wru-step__label {
  font-size: 0.72rem;
  line-height: 1.1;
  text-align: center;
  color: var(--muted, #888);
  white-space: nowrap;
}
.wru-step.is-done .wru-step__label,
.wru-step.is-active .wru-step__label {
  color: var(--text, #f0f0f0);
}
.wru-step.is-active .wru-step__label {
  font-weight: 600;
}
@keyframes wru-pulse {
  0%,
  100% {
    transform: scale(0.7);
    opacity: 0.6;
  }
  50% {
    transform: scale(1);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .wru-modal__spinner,
  .wru-spinner {
    animation-duration: 1.6s;
  }
  .wru-step__pulse {
    animation: none;
  }
}
</style>
