import { compareDocumentIds } from './documentId'
import type { Join } from './types'

/**
 * One join per identity: the newest document replaces the earlier ones instead of adding a second
 * share. A member who wants to add money publishes a bigger join, and every reader — the grid, the
 * pool page and the creator's lock list — sees only that one.
 *
 * Equal timestamps are broken by document id so two honest clients agree on the winner.
 */
export function latestJoins (joins: Join[]): Join[] {
  const latest = new Map<string, Join>()
  for (const join of joins) {
    const key = `${join.poolId}:${join.ownerId}`
    const current = latest.get(key)
    if (current == null || join.createdAt > current.createdAt || (join.createdAt === current.createdAt && compareDocumentIds(current.id, join.id) < 0)) {
      latest.set(key, join)
    }
  }
  return [...latest.values()].sort((a, b) => a.createdAt - b.createdAt || compareDocumentIds(a.id, b.id))
}