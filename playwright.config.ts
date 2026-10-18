import { defineConfig, devices } from '@playwright/test'

// Real-browser accessibility gate: the component gallery is audited with axe across every theme × season.
// `npm run test:e2e` builds the gallery and serves it; CI installs Chromium first.
const PORT = 4175

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 900 } },
  webServer: {
    command: `npm run build:gallery && npx vite preview --config vite.gallery.config.ts --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
