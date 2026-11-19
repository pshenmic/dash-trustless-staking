import type { PoolSnapshot } from './seen'

/*
 * Per-browser memory of the last visit to each pool. Public activity is the same for every identity,
 * so the key is the pool alone; private chat unread markers, when they come, must be keyed per identity
 * instead. Storage is best-effort: a blocked localStorage only means the banner never appears.
 */

const KEY = 'dts:seen:v1'

type SeenMap = Record<string, PoolSnapshot>

function readMap (): SeenMap {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return parsed != null && typeof parsed === 'object' ? parsed as SeenMap : {}
  } catch {
    return {}
  }
}

export function readSeen (poolId: string): PoolSnapshot | null {
  const snapshot = readMap()[poolId]
  return snapshot != null && typeof snapshot.at === 'number' ? snapshot : null
}

export function writeSeen (poolId: string, snapshot: PoolSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readMap(), [poolId]: snapshot }))
  } catch {
    // Storage unavailable: the visit is simply not remembered
  }
}