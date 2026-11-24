import type { Duffs } from './types'

/*
 * Staker economics measured from chain history, not modelled from an emission schedule: Dashscan indexes
 * coinbase transactions per address, so a share's earnings are the coinbase outputs paid to its reward
 * script. Annualising a window is only as good as the window, and the days are always shown.
 */

export interface DashscanOutput {
  address?: string | null
  value?: number | string
}

export interface DashscanAddressTx {
  type: string
  timestamp: string
  vOut?: DashscanOutput[]
}

export interface Payouts {
  total: Duffs
  count: number
  firstAt: number | null
  lastAt: number | null
}

/** Coinbase amounts paid to `address` on or after `since` */
export function coinbasePayouts (transactions: DashscanAddressTx[], address: string, since: number): Payouts {
  let total = 0
  let count = 0
  let firstAt: number | null = null
  let lastAt: number | null = null

  for (const tx of transactions) {
    if (tx.type !== 'COINBASE' || tx.vOut == null) continue
    const at = Date.parse(tx.timestamp)
    if (Number.isNaN(at) || at < since) continue
    let paid = 0
    for (const out of tx.vOut) {
      if (out.address !== address) continue
      paid += Number(out.value ?? 0)
    }
    if (paid <= 0) continue
    total += paid
    count += 1
    firstAt = firstAt == null ? at : Math.min(firstAt, at)
    lastAt = lastAt == null ? at : Math.max(lastAt, at)
  }

  return { total, count, firstAt, lastAt }
}

/** Percent per year of `collateral`, from `reward` earned over `days` */
export function annualisedApy (reward: Duffs, collateral: Duffs, days: number): number | null {
  if (!(collateral > 0) || !(days > 0)) return null
  return (reward / collateral) * (365 / days) * 100
}

export function median (values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

export interface Benchmark {
  /** Nodes actually sampled */
  sample: number
  /** Median coinbase reward per node over the window, per day */
  medianDaily: Duffs | null
  /** Median daily payout annualised against a 1,000 DASH pool */
  apy: number | null
}

/** Network's per-node earning, the yardstick a pool is compared against */
export function networkBenchmark (perNodePayouts: Array<{ rewards: Duffs, days: number }>, collateral: Duffs): Benchmark {
  const daily = perNodePayouts
    .filter(node => node.days > 0)
    .map(node => node.rewards / node.days)
  const medianDaily = median(daily)
  return {
    sample: daily.length,
    // Whole duffs: the median of a division is fractional, and a DASH figure is never fractional duffs
    medianDaily: medianDaily == null ? null : Math.round(medianDaily),
    apy: medianDaily == null ? null : annualisedApy(medianDaily, collateral, 1)
  }
}

export interface PoolEarnings {
  poolId: string
  poolName: string
  locked: Duffs
  rewards: Duffs
  /** Days the window actually covers for this pool */
  days: number
  apy: number | null
  /** Members whose reward address Dashscan has payouts for */
  payingMembers: number
  members: number
}

/** Rounds an APY for display, keeping "no data" distinct from zero */
export function formatApy (apy: number | null): string {
  if (apy == null) return '—'
  if (apy === 0) return '0%'
  return `${apy.toFixed(apy < 10 ? 2 : 1)}%`
}