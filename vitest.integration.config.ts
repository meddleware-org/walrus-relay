import { defineConfig } from 'vitest/config'

// Localnet integration suites for the relay library — run against the Docker-Compose testbed in
// ../walrus-client/localnet after `source ../walrus-client/localnet/.env.localnet`. Gated by
// WALRUS_LOCALNET (self-skip otherwise).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.integration.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
