import { COLLATERAL, DUFFS_PER_DASH } from './consensus'
import { formatDash } from './format'
import { latestJoins } from './joins'
import { findPoolLock } from './status'
import type { Duffs, Join, Lock, Pool } from './types'

/*
 * Statistics for the /stats page. Two sources, kept apart on purpose:
 *   - the documents half folds pools, locks and joins exactly like the home page;
 *   - the network half only exists as wire types from Dashscan, and every aggregate here is a pure
 *     function of a fetched snapshot, so what the page shows can be re-derived from the same JSON.
 */

export interface FunnelStep {
  key: string
  label: string
  count: number
}

/**
 * How far pools get with Platform documents alone, as exclusive stages: a pool sits in exactly one of
 * them, so the counts add up to the pools created and a part-to-whole chart cannot double count.
 */
export function poolStages (pools: Pool[], locks: Lock[], joins: Join[]): FunnelStep[] {
  const totals = new Map<string, Duffs>()
  for (const join of latestJoins(joins)) totals.set(join.poolId, (totals.get(join.poolId) ?? 0) + join.amount)
  const locked = pools.filter(pool => findPoolLock(pool, locks) != null).length
  // A locked pool is past subscribing even if a later top-up left the current total short
  const filled = Math.max(locked, pools.filter(pool => (totals.get(pool.id) ?? 0) >= COLLATERAL).length)
  return [
    { key: 'forming', label: 'Still forming', count: pools.length - filled },
    { key: 'filled', label: `Reached ${formatDash(COLLATERAL)}, not locked`, count: filled - locked },
    { key: 'locked', label: 'Locked by the creator', count: locked }
  ]
}

const SHARE_BUCKETS = [
  { label: '100–249', from: 100, to: 250 },
  { label: '250–499', from: 250, to: 500 },
  { label: '500–749', from: 500, to: 750 },
  { label: '750–999', from: 750, to: 1000 },
  { label: '1,000', from: 1000, to: Infinity }
]

/** Current shares by size, in DASH — a top-up replaces its earlier document */
export function shareSizeBuckets (joins: Join[]): Array<{ label: string, count: number }> {
  const sizes = latestJoins(joins).map(join => join.amount / DUFFS_PER_DASH)
  return SHARE_BUCKETS.map(bucket => ({
    label: bucket.label,
    count: sizes.filter(size => size >= bucket.from && size < bucket.to).length
  }))
}

// ---- Dashscan wire shapes (https://testnet.dashscan.pshenmic.dev)

export interface DashscanGeo {
  ipv4?: string
  countryCode?: string
  city?: string
}

export interface DashscanMasternode {
  proTxHash: string
  status: string
  type: string
  address?: string
  payee?: string
  ownerAddress?: string
  votingAddress?: string
  posPenaltyScore?: number
  lastPaidTime?: string
  platformNodeId?: string | null
  geoIpInfo?: DashscanGeo | null
  createdAt?: string
  updatedAt?: string
}

export interface DashscanBlock {
  height: number
  hash: string
  timestamp: string
  txCount: number
  size: number
  fees: number
  superblock: boolean
  creditPoolBalance?: number | null
  difficulty?: number
}

export interface DashscanTransaction {
  hash: string
  type: string
  blockHeight: number
  timestamp: string
  amount: string
}

export interface DashscanSnapshot {
  masternodes: DashscanMasternode[]
  blocks: DashscanBlock[]
  transactions: DashscanTransaction[]
  totalSupply: string
  fetchedAt: number
}

function median (values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

export interface NetworkCensus {
  total: number
  enabled: number
  banned: number
  regular: number
  evo: number
  withPlatform: number
  medianPenalty: number | null
  /** Newest `updatedAt` in the snapshot — how fresh the census is */
  asOf: number | null
  countries: Array<{ country: string, count: number }>
}

/** Census of the whole network's masternodes, live from Dashscan */
export function masternodeCensus (masternodes: DashscanMasternode[]): NetworkCensus {
  let enabled = 0
  let banned = 0
  let regular = 0
  let evo = 0
  let withPlatform = 0
  let asOf: number | null = null
  const penalties: number[] = []
  const countries = new Map<string, number>()

  for (const node of masternodes) {
    if (node.status === 'ENABLED') enabled += 1
    if (node.status === 'POSE_BANNED') banned += 1
    if (node.type === 'Regular') regular += 1
    if (node.type === 'Evo') evo += 1
    if (node.platformNodeId != null && node.platformNodeId !== '') withPlatform += 1
    if (typeof node.posPenaltyScore === 'number') penalties.push(node.posPenaltyScore)
    if (node.updatedAt != null) {
      const at = Date.parse(node.updatedAt)
      if (!Number.isNaN(at) && (asOf == null || at > asOf)) asOf = at
    }
    const country = node.geoIpInfo?.countryCode
    if (country != null && country !== '') countries.set(country, (countries.get(country) ?? 0) + 1)
  }

  return {
    total: masternodes.length,
    enabled,
    banned,
    regular,
    evo,
    withPlatform,
    medianPenalty: median(penalties),
    asOf,
    countries: [...countries.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }
}

export interface BlockActivity {
  count: number
  fromHeight: number | null
  toHeight: number | null
  medianSeconds: number | null
  txTotal: number
  avgTx: number | null
  superblocks: number
  feesTotal: number
  /** Timestamp of the newest indexed block — Dashscan's block index can lag the chain */
  asOf: number | null
}

/** Block pace and payload over the indexed slice, not "now" unless the index is current */
export function blockActivity (blocks: DashscanBlock[]): BlockActivity {
  const ordered = [...blocks].sort((a, b) => a.height - b.height)
  const gaps: number[] = []
  let asOf: number | null = null
  for (let i = 1; i < ordered.length; i++) {
    const previous = Date.parse(ordered[i - 1].timestamp)
    const current = Date.parse(ordered[i].timestamp)
    if (!Number.isNaN(previous) && !Number.isNaN(current) && current >= previous) gaps.push((current - previous) / 1000)
  }
  for (const block of ordered) {
    const at = Date.parse(block.timestamp)
    if (!Number.isNaN(at) && (asOf == null || at > asOf)) asOf = at
  }
  const txTotal = ordered.reduce((sum, block) => sum + block.txCount, 0)
  return {
    count: ordered.length,
    fromHeight: ordered[0]?.height ?? null,
    toHeight: ordered[ordered.length - 1]?.height ?? null,
    medianSeconds: median(gaps),
    txTotal,
    avgTx: ordered.length === 0 ? null : txTotal / ordered.length,
    superblocks: ordered.filter(block => block.superblock).length,
    feesTotal: ordered.reduce((sum, block) => sum + block.fees, 0),
    asOf
  }
}

/** Transaction types in a fetched slice, most common first */
export function transactionMix (transactions: DashscanTransaction[]): Array<{ type: string, count: number }> {
  const counts = new Map<string, number>()
  for (const tx of transactions) counts.set(tx.type, (counts.get(tx.type) ?? 0) + 1)
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
}