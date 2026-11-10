import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// pshenmic-dpp's WASM runs on WASI pthreads and needs SharedArrayBuffer, which browsers only expose
// to cross-origin isolated pages. The production host must send the same two headers.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}

// base: './' keeps asset URLs relative, so the built app runs from any static host or folder.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation }
})
