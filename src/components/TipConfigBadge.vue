<script setup lang="ts">
// Reads a relay's `/v1/tip-config` and shows the current per-upload tip + reachability.
// Purely presentational; uses the pure `probeRelay` helper (no wallet, no @mysten/walrus).
import { ref, onMounted, watch } from 'vue'
import { probeRelay } from '../lib/relay.js'

const props = defineProps<{
  /** The relay host URL to probe (e.g. `https://sui-walrus-relay.example.com`). */
  host: string
}>()

const loading = ref(true)
const accessible = ref(false)
const tipMist = ref<bigint | null>(null)

async function refresh(): Promise<void> {
  loading.value = true
  const health = await probeRelay(props.host)
  accessible.value = health.accessible
  tipMist.value = health.tip
  loading.value = false
}

onMounted(refresh)
watch(() => props.host, refresh)

function tipLabel(): string {
  if (tipMist.value === null) return 'no tip'
  return `${(Number(tipMist.value) / 1e9).toFixed(4)} SUI`
}
</script>

<template>
  <span class="wru-badge" :data-state="loading ? 'loading' : accessible ? 'up' : 'down'">
    <template v-if="loading">Checking relay…</template>
    <template v-else-if="accessible">● Relay online · tip {{ tipLabel() }}</template>
    <template v-else>● Relay unreachable</template>
  </span>
</template>

<style scoped>
.wru-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--mw-color-border, #ddd);
}
.wru-badge[data-state='up'] {
  color: var(--mw-color-success, #0a7a33);
}
.wru-badge[data-state='down'] {
  color: var(--mw-color-danger, #b00020);
}
.wru-badge[data-state='loading'] {
  color: var(--mw-color-text-muted, #666);
}
</style>
