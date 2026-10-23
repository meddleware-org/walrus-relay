<script setup lang="ts">
// Reads a relay's `/v1/tip-config` and shows the current per-upload tip + reachability.
// Purely presentational; uses the pure `probeRelay` helper (no wallet, no @mysten/walrus).
import { ref, onMounted, watch } from 'vue'
import { formatCoinExact, probeRelay, type RelayHealth } from '../lib/relay.js'

const props = defineProps<{
  /** The relay host URL to probe (e.g. `https://sui-walrus-storage-relay.example.com`). */
  host: string
}>()

const loading = ref(true)
const accessible = ref(false)
/** Set when `host` is not a usable relay URL: a configuration error, not an outage. */
const invalid = ref(false)
const health = ref<Pick<RelayHealth, 'tip' | 'tipStatus' | 'tipKind'>>({ tip: null, tipStatus: 'unknown', tipKind: null })
let generation = 0

async function refresh(): Promise<void> {
  const mine = ++generation
  loading.value = true
  invalid.value = false
  try {
    const result = await probeRelay(props.host)
    if (mine !== generation) return // the host changed while this probe was in flight
    accessible.value = result.accessible
    health.value = result
  } catch {
    if (mine !== generation) return
    accessible.value = false
    invalid.value = true
    health.value = { tip: null, tipStatus: 'unknown', tipKind: null }
  } finally {
    if (mine === generation) loading.value = false
  }
}

onMounted(refresh)
watch(() => props.host, refresh)

/** The tip as the relay reports it: a figure, no tip, or why there is no figure. Never "no tip" for an unknown one. */
function tipLabel(): string {
  const { tip, tipStatus, tipKind } = health.value
  if (tipStatus === 'none') return 'no tip'
  if (tipStatus === 'over-ceiling') return 'above the limit'
  if (tipStatus === 'known' && tip !== null) {
    return `${tipKind === 'linear' ? 'from ' : ''}${formatCoinExact(tip, 'SUI')}`
  }
  return 'unknown'
}
</script>

<template>
  <span
    class="wru-badge"
    :data-state="loading ? 'loading' : invalid ? 'invalid' : accessible ? 'up' : 'down'"
    :data-tip="loading || invalid || !accessible ? undefined : health.tipStatus"
  >
    <template v-if="loading">Checking relay…</template>
    <template v-else-if="invalid">● Relay address is not valid</template>
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
  border: 1px solid var(--border, #ded6cf);
}
.wru-badge[data-state='up'] {
  color: var(--ok, #177542);
}
.wru-badge[data-state='down'],
.wru-badge[data-state='invalid'] {
  color: var(--danger, #b3261e);
}
.wru-badge[data-tip='unknown'],
.wru-badge[data-tip='over-ceiling'] {
  color: var(--accent, #b84527);
}
.wru-badge[data-state='loading'] {
  color: var(--muted, #6e635c);
}
</style>
