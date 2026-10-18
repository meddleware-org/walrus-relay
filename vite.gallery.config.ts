import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Builds the gallery used by the Playwright + axe contrast gate (not part of the package).
export default defineConfig({
  root: 'gallery',
  plugins: [vue()],
  build: { outDir: '../gallery-dist', emptyOutDir: true },
})
