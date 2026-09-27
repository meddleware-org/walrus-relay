import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // One Vue copy for SFCs and @vue/test-utils (events/reactivity must cross the boundary).
  resolve: { dedupe: ['vue', '@vue/test-utils'] },
  test: {
    environment: 'node',
    // Unit tests live beside the pure lib and under tests/. Localnet integration suites are gated
    // and run via vitest.integration.config.ts so the default `npm test` stays fast and offline.
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/integration/**', 'node_modules/**'],
  },
})
