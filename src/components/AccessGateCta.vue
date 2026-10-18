<script setup lang="ts">
// "Purchase access" call-to-action, shown when the operator relay is NFT-gated and the
// connected wallet does not (yet) hold the access NFT. Presentational + a single emit;
// the parent owns the actual purchase (via `useAccessGate().purchase`). It shows the terms read
// from the chain (`useAccessGate().terms`) before the wallet opens: the exact payment, who
// receives which part, the network and what the pass is. Without terms the button stays disabled.
import { computed } from 'vue'
import type { PurchaseTerms } from '../composables/useAccessGate.js'
import { formatCoinExact } from '../lib/relay.js'

const props = defineProps<{
  /** Whether a gate is configured for this network. */
  gateConfigured: boolean
  /** Ownership result: null = checking, true/false = decided. */
  hasAccess: boolean | null
  /** Whether a purchase is in flight. */
  busy?: boolean
  /** The purchase terms read from the chain (`useAccessGate().terms`); `null` until they are read. */
  terms: PurchaseTerms | null
  /** Why the terms could not be read (`useAccessGate().termsError`). */
  termsError?: string | null
  /** Why the last purchase did not complete (`useAccessGate().purchaseError`). */
  purchaseError?: string | null
}>()

const emit = defineEmits<{ (e: 'purchase'): void }>()

const show = computed(() => props.gateConfigured && props.hasAccess === false)
const canBuy = computed(() => props.terms !== null && !props.terms.paused && !props.busy)

function sui(mist: bigint): string {
  return formatCoinExact(mist, 'SUI')
}

function passLabel(t: PurchaseTerms): string {
  const uses = t.defaultUses === 0n ? 'unlimited uses' : `${t.defaultUses} ${t.defaultUses === 1n ? 'use' : 'uses'}`
  return `${uses}, ${t.soulbound ? 'soulbound (cannot be transferred)' : 'transferable'}`
}
</script>

<template>
  <div v-if="show" class="wru-cta">
    <p>The operator relay is restricted to access-pass holders. Purchase a pass to upload through it.</p>

    <p v-if="termsError" class="wru-cta__error" role="alert">
      The pass price could not be read from the chain, so purchase is unavailable: {{ termsError }}
    </p>
    <p v-else-if="!terms" class="wru-cta__note" role="status">Reading the pass price from the chain…</p>
    <dl v-else class="wru-terms">
      <dt>Network</dt>
      <dd>{{ terms.network }}</dd>
      <dt>You pay</dt>
      <dd>{{ sui(terms.priceMist) }} (plus network gas)</dd>
      <dt>Operator receives</dt>
      <dd>
        {{ sui(terms.operator.mist) }}
        <code class="wru-terms__addr">{{ terms.operator.address }}</code>
      </dd>
      <dt>Platform fee</dt>
      <dd>
        {{ sui(terms.platform.mist) }}
        <code class="wru-terms__addr">{{ terms.platform.address }}</code>
      </dd>
      <dt>Pass</dt>
      <dd>{{ passLabel(terms) }}</dd>
    </dl>

    <p v-if="terms?.paused" class="wru-cta__error" role="status">Purchases from this gate are paused right now.</p>
    <p v-if="purchaseError" class="wru-cta__error" role="alert">{{ purchaseError }}</p>

    <button type="button" :disabled="!canBuy" @click="emit('purchase')">
      <span v-if="busy" class="wru-spinner" aria-hidden="true"></span>
      Purchase access<template v-if="terms"> ({{ sui(terms.priceMist) }})</template>
    </button>
  </div>
</template>

<style scoped>
.wru-cta {
  margin: 0.75rem 0;
  padding: 0.75rem;
  border: 1px solid var(--border, #ded6cf);
  border-radius: 8px;
  background: var(--lift, #efeae6);
  color: var(--text, inherit);
}
.wru-cta p {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
}
.wru-cta__note {
  color: var(--muted, #6e635c);
}
.wru-cta__error {
  color: var(--danger, #b3261e);
}
.wru-terms {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 0.75rem;
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
}
.wru-terms dt {
  font-weight: 600;
}
.wru-terms dd {
  margin: 0;
  min-width: 0;
}
.wru-terms__addr {
  display: block;
  font-size: 0.8rem;
  overflow-wrap: anywhere;
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
