// A real-browser gallery of the three components in their states, loaded with the design tokens and the
// seasons. Playwright + axe (e2e/contrast.spec.ts) drive it across theme × season, which jsdom cannot do
// (no layout, no computed colours: axe's colour-contrast rule never runs there). Not published: `files`
// ships `src` only.
import { createApp } from 'vue'
import '@meddleware/design-tokens/tokens.css'
import '@meddleware/design-tokens/seasons.css'
import ComponentGallery from './ComponentGallery.vue'

const params = new URLSearchParams(location.search)
const root = document.documentElement
root.setAttribute('data-theme', params.get('theme') === 'dark' ? 'dark' : 'light')
const season = params.get('season')
if (season) root.setAttribute('data-season', season)

// Fixtures for every relay the gallery probes. A host that is not listed answers with a known tip.
const answers: Record<string, () => Promise<Response>> = {
  'https://up.example': async () => new Response(JSON.stringify({ send_tip: { kind: { const: 100_000 } } })),
  'https://linear.example': async () =>
    new Response(JSON.stringify({ send_tip: { kind: { linear: { base: 1_000_000, encoded_size_mul_per_kib: 10 } } } })),
  'https://none.example': async () => new Response('"no_tip"'),
  'https://unknown.example': async () => new Response(JSON.stringify({ send_tip: 'garbage' })),
  'https://over.example': async () => new Response(JSON.stringify({ send_tip: { kind: { const: '900000000000' } } })),
  'https://down.example': async () => new Response('', { status: 503 }),
  'https://hang.example': () => new Promise<Response>(() => {}),
}
window.fetch = (async (input: RequestInfo | URL) => {
  const host = String(input).replace(/\/v1\/tip-config$/, '')
  return (answers[host] ?? answers['https://up.example']!)()
}) as typeof fetch

createApp(ComponentGallery, { view: params.get('view') ?? 'badges', fail: params.get('fail') ?? 'none' }).mount('#app')
