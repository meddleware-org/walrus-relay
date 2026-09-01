<script setup lang="ts">
// "Purchase access" call-to-action, shown when the operator relay is NFT-gated and the
// connected wallet does not (yet) hold the access NFT. Presentational + a single emit;
// the parent owns the actual purchase (via `useAccessGate().purchase`).
import { computed } from 'vue'

const props = defineProps<{
  /** Whether a gate is configured for this network. */
  gateConfigured: boolean
  /** Ownership result: null = checking, true/false = decided. */
  hasAccess: boolean | null
  /** Whether a purchase is in flight. */
  busy?: boolean
  /** Optional price in MIST, for display. */
  priceMist?: bigint | number | null
}>()

const emit = defineEmits<{ (e: 'purchase'): void }>()

const show = computed(() => props.gateConfigured && props.hasAccess === false)

function priceLabel(): string {
  if (props.priceMist == null) return ''
  const sui = Number(props.priceMist) / 1e9
  return ` (${sui.toFixed(4)} SUI)`
}
</script>

<template>
  <div v-if="show" class="wru-cta">
    <p>
      The operator relay is restricted to access-NFT holders. Purchase access to upload through it
      and support this app.
    </p>
    <button type="button" :disabled="busy" @click="emit('purchase')">
      <span v-if="busy" class="wru-spinner" aria-hidden="true"></span>
      Purchase access{{ priceLabel() }}
    </button>
  </div>
</template>

<style scoped>
.wru-cta {
  margin: 0.75rem 0;
  padding: 0.75rem;
  border: 1px solid var(--mw-color-border, #ddd);
  border-radius: 8px;
  background: var(--mw-color-surface-muted, #fafafa);
}
.wru-cta p {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
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
