import { mockBackend } from './mock/mockBackend'
import type { Backend } from './types'

/*
 * The backend the app runs against:
 *   mock     everything simulated in the browser (the full flow, including registration)
 *   testnet  real Platform documents on testnet; registration is not wired yet (see live/index.ts)
 * Chosen in Settings (kept in localStorage), defaulting to VITE_BACKEND.
 */

export type BackendMode = 'mock' | 'testnet'

const STORAGE_KEY = 'dts:backend'

export function backendMode (): BackendMode {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage unavailable: use the build default
  }
  const value = stored ?? import.meta.env?.VITE_BACKEND
  return value === 'testnet' ? 'testnet' : 'mock'
}

/** Switching reloads the page: the backend is chosen once, when the app starts */
export function setBackendMode (mode: BackendMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Storage unavailable
  }
  location.reload()
}

async function selectBackend (): Promise<Backend> {
  const contractId = import.meta.env?.VITE_CONTRACT_ID
  if (backendMode() !== 'testnet' || contractId == null || contractId === '') return mockBackend
  // Loaded on demand: the SDK and its WASM are only needed for the live backend
  const [{ createTestnetBackend }, { extensionSigner }] = await Promise.all([import('./live'), import('./live/extensionSigner')])
  let dapiUrls: string[] = []
  try {
    dapiUrls = (JSON.parse(localStorage.getItem('dts:settings') ?? '{}') as { dapiEndpoints?: string[] }).dapiEndpoints ?? []
  } catch {
    // No saved settings
  }
  return createTestnetBackend(contractId, extensionSigner, dapiUrls.map(u => u.startsWith('http') ? u : `https://${u}`))
}

export const backend: Backend = await selectBackend()

export * from './types'
