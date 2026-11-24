import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/*
 * The policy the built app runs under, injected as a meta tag so it travels with the bundle to any
 * static host.
 *
 * - `wasm-unsafe-eval` lets pshenmic-dpp compile its WebAssembly without opening up `eval`.
 * - `worker-src blob:` is kept for WASM runtimes that build their threads from a blob URL; the base
 *   dpp this app uses does not, so it is a guard rather than a current requirement.
 * - `style-src 'unsafe-inline'` is required: dash-ui-kit injects its styles at runtime.
 * - `connect-src https:` is deliberately broad: DAPI endpoints are arbitrary masternode hosts supplied
 *   by the network, so they cannot be enumerated here.
 * - `frame-ancestors` and `report-uri` cannot be expressed in a meta tag; the host sends frame-ancestors.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
  'upgrade-insecure-requests'
].join('; ')

function contentSecurityPolicy (): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [{
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend' as const
      }]
    }
  }
}

// base: './' keeps asset URLs relative, so the built app runs from any static host or folder.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), contentSecurityPolicy()]
})
