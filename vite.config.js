import { defineConfig } from 'vite'

// Cloudflare Pages (root domain): no env var needed → base '/'
// GitHub Pages (/pick-tagon/ subpath): set VITE_BASE_PATH=/pick-tagon/ in CI
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
