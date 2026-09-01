<script setup lang="ts">
// Generic Walrus blob-upload widget. UI + orchestration only — the heavy
// `@mysten/walrus` client and the wallet live in the consuming app, injected via
// `performUpload`. This keeps `@meddleware/walrus-relay` free of wasm/wallet
// deps (preserving the lazy-load boundary) and wallet-agnostic. Relay selection +
// tip estimation come from `useWalrusRelay`.
import { ref, onMounted, computed } from 'vue'
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

const emit = defineEmits<{ (e: 'uploaded', result: UploadResult): void }>()

const { selectedRelayHost, availableRelays, estimatedCost, fileSizeBytes, checkOperatorRelayHealth } =
  useWalrusRelay(props.hosts, props.access)

const uploading = ref(false)
const status = ref('')
const error = ref<string | null>(null)
const fileName = ref('')
let bytes: Uint8Array | null = null

onMounted(() => {
  checkOperatorRelayHealth()
})

const showPublicRelayTip = computed(() => {
  const publicHost = availableRelays.value.find((r) => r.isPublic)?.host
  return availableRelays.value.length > 1 && selectedRelayHost.value !== publicHost
})

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
    status.value = 'Uploaded ✓'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    status.value = ''
  } finally {
    uploading.value = false
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
      <button type="button" :disabled="uploading || !connected || !fileName" @click="upload">
        <span v-if="uploading" class="wru-spinner" aria-hidden="true"></span>
        Upload to Walrus
      </button>
    </div>

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
    <p v-if="showPublicRelayTip" class="wru-hint">
      Tip: select the public relay above to avoid the relay fee.
    </p>

    <p id="wru-help" class="wru-hint" aria-live="polite">
      Requires <strong>WAL</strong> (storage) and <strong>SUI</strong> (gas + a small relay fee) in
      your wallet; two wallet approvals.
      <span v-if="status">{{ status }}</span>
    </p>
    <p v-if="error" class="wru-error" role="alert">{{ error }}</p>
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
</style>
