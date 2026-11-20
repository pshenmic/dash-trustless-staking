/** How long a pool keeps the "New pool" pill after it was created */
export const NEW_POOL_MS = 7 * 24 * 60 * 60 * 1000

/** True while the pool is younger than a week — the grid's "New pool" pill, unrelated to whether you visited */
export function isNewPool (createdAt: number, now = Date.now()): boolean {
  return now - createdAt < NEW_POOL_MS
}