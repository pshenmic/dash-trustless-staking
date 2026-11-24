import { latestJoins } from './joins'
import { findPoolLock } from './status'
import type { Duffs, Join, Lock, Pool } from './types'

/** One point of the growth chart: the committed total at that moment */
export interface HomeHistoryPoint {
  at: number
  total: Duffs
}

/** A current share as the chart sees it */
export interface SharePoint {
  at: number
  amount: Duffs
}

export interface HomeStats {
  pools: number
  openPools: number
  lockedPools: number
  /** Current shares across every pool, a top-up replacing its earlier document */
  pooled: Duffs
  /** Amounts the locks actually name, not 1000 per lock */
  locked: Duffs
  shares: number
  members: number
  /**
   * The shares the locks name, oldest first — what actually reached a masternode registration. A lock
   * snapshots document ids, so these are resolved against every join, not only the current share.
   */
  lockedPoints: SharePoint[]
  /** Operator keys of locked pools — what the running count looks up in the masternode list */
  lockedOperators: string[]
}

const DAY = 86_400_000

/**
 * A cumulative series for one period. Buckets stay readable at every length: daily up to a month,
 * weekly beyond it. Every bucket is emitted, empty ones included, so the axis spans the whole window.
 * Shares older than the window are carried into its first point.
 */
export function cumulativeSeries (points: SharePoint[], days: number, now = Date.now()): HomeHistoryPoint[] {
  const bucket = days <= 31 ? DAY : 7 * DAY
  const start = now - days * DAY
  const sorted = [...points].sort((a, b) => a.at - b.at)
  let total: Duffs = 0
  let index = 0
  for (; index < sorted.length && sorted[index].at <= start; index++) total += sorted[index].amount

  const series: HomeHistoryPoint[] = []
  for (let at = start + bucket; ; at += bucket) {
    // The last bucket ends now, so the final point is the pooled total on screen
    const edge = Math.min(at, now)
    while (index < sorted.length && sorted[index].at <= edge) total += sorted[index++].amount
    series.push({ at: edge, total })
    if (edge >= now) return series
  }
}

/**
 * Landing-page totals from documents only. Everything here is a pure fold over pools, locks and
 * joins, so the numbers a newcomer sees are exactly the documents that exist.
 */
export function homeStats (pools: Pool[], locks: Lock[], joins: Join[]): HomeStats {
  const current = latestJoins(joins)
  // Every join, because a lock snapshots ids and may name a share a later top-up superseded
  const byId = new Map(joins.map(join => [join.id, join]))
  const lockedOperators: string[] = []
  const lockedPoints: SharePoint[] = []
  let locked: Duffs = 0
  let lockedPools = 0

  for (const pool of pools) {
    const lock = findPoolLock(pool, locks)
    if (lock == null) continue
    lockedPools += 1
    lockedOperators.push(pool.operatorPubKey)
    for (const id of lock.joinIds) {
      const join = byId.get(id)
      if (join == null || join.poolId !== pool.id) continue
      locked += join.amount
      lockedPoints.push({ at: join.createdAt, amount: join.amount })
    }
  }

  return {
    pools: pools.length,
    openPools: pools.length - lockedPools,
    lockedPools,
    pooled: current.reduce((sum, join) => sum + join.amount, 0),
    locked,
    shares: current.length,
    members: new Set(current.map(join => join.ownerId)).size,
    lockedPoints: lockedPoints.sort((a, b) => a.at - b.at),
    lockedOperators
  }
}