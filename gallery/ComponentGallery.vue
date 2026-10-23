<script setup lang="ts">
import { markRaw, ref } from 'vue'
import { attachCertifyRetry, attachDuplicateExisting, attachUploadRetry, type BlobUploadResult } from '@meddleware/walrus-storage-client/flow'
import { AccessGateCta, TipConfigBadge, WalrusUpload, type PurchaseTerms } from '../src/index'

const props = defineProps<{ view: string; fail: string }>()

const terms: PurchaseTerms = {
  network: 'testnet',
  gateId: `0x${'a1'.repeat(32)}`,
  priceMist: 10_000_000n,
  operator: { address: `0x${'0b'.repeat(32)}`, mist: 9_980_000n },
  platform: { address: `0x${'7e'.repeat(32)}`, mist: 20_000n },
  paused: false,
  soulbound: true,
  defaultUses: 10n,
}

const result = { blobId: 'blob-1', url: 'https://aggregator.example/v1/blobs/blob-1' } as BlobUploadResult

// The upload the gallery's widget runs: it fails, hangs or succeeds as the `fail` parameter says, so
// every state the widget can show is reachable in a real browser.
async function performUpload(
  _bytes: Uint8Array,
  opts: { onStatus: (s: { step: 'register'; detail: string }) => void },
): Promise<BlobUploadResult> {
  if (props.fail === 'hang') {
    opts.onStatus({ step: 'register', detail: 'Approve the registration in your wallet…' })
    return new Promise(() => {})
  }
  if (props.fail === 'retry') {
    const e = new Error('The upload to the relay failed (503).')
    attachUploadRetry(e, async () => result)
    throw e
  }
  if (props.fail === 'certify') {
    const e = new Error('Certification was declined.')
    attachCertifyRetry(e, async () => result)
    throw e
  }
  if (props.fail === 'duplicate') {
    const e = new Error('You already own this blob.')
    attachDuplicateExisting(e, { kind: 'certified', blobId: 'blob-1', objectId: '0xblob', endEpoch: 120 })
    throw e
  }
  return result
}

const gated = markRaw({ gateConfigured: true, hasAccess: ref<boolean | null>(true), singleUse: ref(true) })
const estimateStorageCost = async (_size: number, epochs: number): Promise<bigint> => BigInt(epochs) * 1_000_000n
</script>

<template>
  <main>
    <h1>walrus-storage-kit gallery</h1>

    <section v-if="view === 'badges'">
      <h2>Relay badge</h2>
      <ul class="list">
        <li><TipConfigBadge host="https://up.example" /></li>
        <li><TipConfigBadge host="https://linear.example" /></li>
        <li><TipConfigBadge host="https://none.example" /></li>
        <li><TipConfigBadge host="https://unknown.example" /></li>
        <li><TipConfigBadge host="https://over.example" /></li>
        <li><TipConfigBadge host="https://down.example" /></li>
        <li><TipConfigBadge host="https://hang.example" /></li>
        <li><TipConfigBadge host="http://not-secure.example" /></li>
      </ul>
    </section>

    <section v-else-if="view === 'cta'">
      <h2>Purchase prompt</h2>
      <AccessGateCta gate-configured :has-access="false" :terms="terms" />
      <AccessGateCta gate-configured :has-access="false" :terms="terms" busy />
      <AccessGateCta gate-configured :has-access="false" :terms="null" />
      <AccessGateCta gate-configured :has-access="false" :terms="null" terms-error="rpc unavailable" />
      <AccessGateCta
        gate-configured
        :has-access="false"
        :terms="{ ...terms, paused: true, defaultUses: 0n, soulbound: false }"
        purchase-error="The payment is less than the gate price."
      />
    </section>

    <section v-else>
      <h2>Upload</h2>
      <WalrusUpload
        :hosts="{ operator: 'https://relay.example', public: 'https://relay.example' }"
        connected
        :access="gated"
        session-key="testnet:0xabc"
        :perform-upload="performUpload"
        :estimate-storage-cost="estimateStorageCost"
      />
    </section>
  </main>
</template>

<style>
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, sans-serif;
}
main {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1rem;
}
.list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0;
  list-style: none;
}
</style>
