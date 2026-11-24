import { defaultGeneration, GENERATIONS } from '../contracts'
import { dapiEndpoints } from '../config'
import { mockBackend } from './mock/mockBackend'
import type { Backend, PlatformSource } from './types'

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
  const usable = GENERATIONS.filter(g => g.contractId !== '')
  if (backendMode() !== 'testnet' || usable.length === 0) return mockBackend
  // Loaded on demand: the SDK and its WASM are only needed for the live backend
  const { createTestnetBackend } = await import('./live')
  return createTestnetBackend(usable, dapiEndpoints())
}

export const backend: Backend = await selectLoaded()

async function selectLoaded (): Promise<Backend> {
  const loaded = await selectBackend()
  return {
    ...loaded,
    // Direct `backend.platform` use (writes, dialogs) follows the generation the router is showing,
    // so a pool on generation 1 never receives a generation-2 action. Set by useSyncActiveGeneration.
    get platform () { return loaded.platformFor(activeGenerationSlug) }
  }
}

let activeGenerationSlug = GENERATIONS[GENERATIONS.length - 1].slug

/** Called by the shell on every navigation; unprefixed routes fall back to the default generation */
export function setActiveGeneration (slug: string | null | undefined): void {
  activeGenerationSlug = GENERATIONS.some(g => g.slug === slug) ? slug as string : defaultGeneration.slug
}

/** The platform source for one generation, so documents are read from the contract they live in */
export function platformFor (ref: { slug: string }): PlatformSource {
  return backend.platformFor(ref.slug)
}

export * from './types'
