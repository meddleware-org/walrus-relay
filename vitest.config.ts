import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Unit tests live beside the pure lib and under tests/. Localnet integration suites are gated
    // and run via vitest.integration.config.ts so the default `npm test` stays fast and offline.
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/integration/**', 'node_modules/**'],
  },
})
