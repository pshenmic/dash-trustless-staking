import type { PoolStatus } from './types'

/*
 * "What changed while I was away" for one pool. Platform documents are immutable and append-only, so
 * the snapshot is a few counters plus the moment they were true — no document lists, no diffing:
 * a status change and a count that grew are the whole story the UI needs. The activity feed uses the
 * same `at` as a divider, which is why it is stored even on a first visit.
 */

export interface PoolSnapshot {
  /** When the pool was last on screen (ms) */
  at: number
  status: PoolStatus
  consents: number
  fundings: number
  members: number
}

export interface PoolChanges {
  /** The stored `at` — the moment the comparison starts from */
  since: number
  /** The status before this visit, or null when it did not change */
  statusFrom: PoolStatus | null
  statusTo: PoolStatus
  consents: number
  fundings: number
  members: number
}

/** Deltas between the stored snapshot and now; null when nothing changed (or on a first visit) */
export function changesSince (before: PoolSnapshot | null, now: Omit<PoolSnapshot, 'at'>): PoolChanges | null {
  if (before == null) return null
  const consents = Math.max(0, now.consents - before.consents)
  const fundings = Math.max(0, now.fundings - before.fundings)
  const members = Math.max(0, now.members - before.members)
  const statusChanged = before.status !== now.status
  if (!statusChanged && consents === 0 && fundings === 0 && members === 0) return null
  return {
    since: before.at,
    statusFrom: statusChanged ? before.status : null,
    statusTo: now.status,
    consents,
    fundings,
    members
  }
}

/** The snapshot to store after this visit: the state just seen, stamped now */
export function snapshotNow (now: Omit<PoolSnapshot, 'at'>, at = Date.now()): PoolSnapshot {
  return { ...now, at }
}