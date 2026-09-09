<script setup lang="ts">
// Generic Walrus blob-upload widget. UI + orchestration only — the heavy
// `@mysten/walrus` client and the wallet live in the consuming app, injected via
// `performUpload`. This keeps `@meddleware/walrus-relay` free of wasm/wallet
// deps (preserving the lazy-load boundary) and wallet-agnostic. Relay selection +
// tip estimation come from `useWalrusRelay`.
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useWalrusRelay } from '../composables/useWalrusRelay.js'
import type { WalrusRelayHosts, RelayAccessOptions } from '../composables/useWalrusRelay.js'

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
     * App-provided upload. Receives the chosen bytes + the selected relay host and a
     * status callback; performs encode → register → upload → certify → getBlob using
     * the app's Walrus client + wallet, and resolves the blob result.
     */
    performUpload: (
      bytes: Uint8Array,
      opts: { relayHost: string; onStatus: (s: string) => void },
    ) => Promise<UploadResult>
  }>(),
  { accept: '*/*', access: () => ({}) },
)

const emit = defineEmits<{
  (e: 'uploaded', result: UploadResult): void
  /** Fires once per upload attempt after it resolves — success OR failure. Lets the host
   *  refresh on-chain-derived views (owned blobs) since a failed UI run may still have landed. */
  (e: 'settled'): void
}>()

const { selectedRelayHost, availableRelays, estimatedCost, fileSizeBytes, checkOperatorRelayHealth } =
  useWalrusRelay(props.hosts, props.access)

const uploading = ref(false)
const status = ref('')
const error = ref<string | null>(null)
const fileName = ref('')
let bytes: Uint8Array | null = null

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

async function upload(): Promise<void> {
  if (!bytes) {
    error.value = 'Choose a file first.'
    return
  }
  uploading.value = true
  error.value = null
  try {
    const result = await props.performUpload(bytes, {
      relayHost: selectedRelayHost.value,
      onStatus: (s) => {
        status.value = s
      },
    })
    emit('uploaded', result)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    // The transient step text only lives in the modal; the persistent "Uploaded ✓" is the
    // host's result section. Clear it as the modal closes so it never lingers.
    status.value = ''
    uploading.value = false
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
        @click="upload"
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

    <p v-if="fileName && estimatedCost" class="wru-cost">
      <strong>Estimated cost:</strong> {{ estimatedCost.label }}
    </p>

    <p id="wru-help" class="wru-hint">
      Requires <strong>WAL</strong> (storage) and <strong>SUI</strong> (gas + a small relay fee) in
      your wallet; two wallet approvals.
    </p>
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
          <span class="wru-modal__spinner" aria-hidden="true"></span>
          <h2 id="wru-modal-title" class="wru-modal__title">Uploading to Walrus…</h2>
          <p class="wru-modal__status" aria-live="polite">{{ status || 'Preparing…' }}</p>
          <p class="wru-modal__hint">Keep this tab open and approve the wallet prompts.</p>
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
.wru-modal__spinner {
  display: inline-block;
  width: 2rem;
  height: 2rem;
  border: 3px solid color-mix(in srgb, currentColor 30%, transparent);
  border-top-color: var(--accent, currentColor);
  border-radius: 50%;
  animation: wru-spin 0.8s linear infinite;
}
.wru-modal__title {
  margin: 0.9rem 0 0.35rem;
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
@media (prefers-reduced-motion: reduce) {
  .wru-modal__spinner,
  .wru-spinner {
    animation-duration: 1.6s;
  }
}
</style>
