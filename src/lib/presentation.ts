import { findProvider, operatorId } from '../operators'
import { duffsToDashString, formatBasisPoints } from './format'
import type { Duffs, Pool, PoolListStatus } from './types'

export type TagTone = 'orange' | 'blue' | 'mint' | 'red' | 'grey'

export interface PoolTag {
  label: 'Filling' | 'Filled'
  tone: 'orange' | 'blue'
}

/** The pools grid only knows Platform data, so a pool is either still filling or already filled */
export function poolListTag (status: PoolListStatus): PoolTag {
  return status === 'NEW'
    ? { label: 'Filling', tone: 'orange' }
    : { label: 'Filled', tone: 'blue' }
}

/** The pool's immutable early-exit term, on the card and in the sheet alike */
export function earlyExitLabel (penalty: Duffs): string {
  return penalty === 0 ? 'Free exit' : `${duffsToDashString(penalty)} DASH exit`
}

/** A listed provider by name; any other key stays anonymous but readable (first 8 hex) */
export function operatorLabel (pool: Pool): { name: string, fee: string } {
  return {
    name: findProvider(pool.operatorPubKey)?.name ?? operatorId(pool.operatorPubKey),
    fee: formatBasisPoints(pool.operatorReward)
  }
}

function hash (value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/**
 * A pool has no image, so its tile is derived from the id: a stable gradient, with initials from the name.
 * Apostrophes are stripped first so "Hamster's Pool" reads HP, not HS.
 */
export function poolTile (name: string, id: string): { initials: string, background: string } {
  const hue = hash(id) % 360
  const words = name.replace(/['’]/g, '').split(/[^A-Za-z0-9]+/).filter(word => word !== '')
  const initials = words.length >= 2
    ? `${words[0][0]}${words[1][0]}`.toUpperCase()
    : (words[0] ?? id).slice(0, 2).toUpperCase()
  return {
    initials,
    background: `linear-gradient(135deg, hsl(${hue} 85% 55%), hsl(${(hue + 40) % 360} 85% 45%))`
  }
}

export type GridDensity = 'auto' | 2 | 3 | 4

export function gridClass (density: GridDensity): string {
  if (density === 2) return 'grid-cols-1 sm:grid-cols-2'
  if (density === 3) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  if (density === 4) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
}