import { describe, expect, test } from 'vitest'
import { base58 } from '@scure/base'
import { DUFFS_PER_DASH } from './consensus'
import {
  blockActivity, masternodeCensus, poolStages, shareSizeBuckets, transactionMix,
  type DashscanBlock, type DashscanMasternode, type DashscanTransaction
} from './stats'
import type { Join, Lock, Pool } from './types'

const DASH = DUFFS_PER_DASH
const idOf = (n: number): string => base58.encode(Uint8Array.from({ length: 32 }, (_, i) => i === 0 ? n : 0))

const pool = (id: string, over: Partial<Pool> = {}): Pool => ({
  id,
  ownerId: 'pool-owner',
  createdAt: 0,
  operatorPubKey: 'op',
  votingAddress: 'yVoting',
  operatorReward: 0,
  earlyPeriodBlocks: 0,
  earlyPenalty: 0,
  fee: 1_000_000,
  ...over
})

const join = (ownerId: string, dash: number, n: number, over: Partial<Join> = {}): Join => ({
  id: idOf(n),
  ownerId,
  createdAt: n,
  poolId: 'p1',
  amount: dash * DASH,
  ownerAddress: `yOwner-${ownerId}`,
  refundAddress: `yRefund-${ownerId}`,
  inputs: [{ txid: 'ab'.repeat(32), vout: 0 }],
  changeAddress: `yChange-${ownerId}`,
  ...over
})

const lock = (poolId: string, ownerId: string, ids: string[]): Lock => ({ id: idOf(90), ownerId, createdAt: 1, poolId, joinIds: ids })

describe('poolStages', () => {
  test('each pool lands in exactly one stage, so the counts add up to the pools created', () => {
    const a = pool('p1'), b = pool('p2'), c = pool('p3')
    const joins = [
      join('A', 600, 1), join('B', 400, 2), // p1 reaches exactly the collateral
      join('C', 300, 3), // p2 does not
      join('D', 500, 4, { poolId: 'p3' }), join('E', 500, 5, { poolId: 'p3' })
    ]
    const locks = [lock('p1', 'pool-owner', [idOf(1), idOf(2)])]
    const stages = poolStages([a, b, c], locks, joins)
    expect(stages.map(step => step.count)).toEqual([1, 1, 1])
    expect(stages.reduce((sum, step) => sum + step.count, 0)).toBe(3)
  })

  test('a topped-up share is not double counted toward the collateral', () => {
    // Latest accounts for 800 DASH; summing every document would reach exactly 1,000
    const joins = [join('A', 200, 1), join('A', 200, 2), join('B', 300, 3), join('C', 300, 4)]
    expect(poolStages([pool('p1')], [], joins).map(step => step.count)).toEqual([1, 0, 0])
  })

  test('a locked pool is past subscribing even if its current shares fell short', () => {
    const joins = [join('A', 300, 1), join('B', 300, 2)]
    const locks = [lock('p1', 'pool-owner', [idOf(1), idOf(2)])]
    expect(poolStages([pool('p1')], locks, joins).map(step => step.count)).toEqual([0, 0, 1])
  })
})

describe('shareSizeBuckets', () => {
  test('buckets current shares by size', () => {
    const joins = [
      join('A', 100, 1), join('B', 249, 2), join('C', 250, 3),
      join('D', 750, 4), join('E', 1000, 5)
    ]
    expect(shareSizeBuckets(joins).map(bucket => bucket.count)).toEqual([2, 1, 0, 1, 1])
  })
})

const masternode = (over: Partial<DashscanMasternode>): DashscanMasternode => ({
  proTxHash: 'hash',
  status: 'ENABLED',
  type: 'Regular',
  posPenaltyScore: 0,
  platformNodeId: null,
  ...over
})

describe('masternodeCensus', () => {
  test('counts statuses, types, platform nodes and geography', () => {
    const nodes = [
      masternode({ status: 'ENABLED', platformNodeId: 'p1', geoIpInfo: { countryCode: 'DE' }, posPenaltyScore: 0 }),
      masternode({ status: 'ENABLED', geoIpInfo: { countryCode: 'DE' }, posPenaltyScore: 10 }),
      masternode({ status: 'POSE_BANNED', type: 'Evo', posPenaltyScore: 400, geoIpInfo: { countryCode: 'US' } }),
      masternode({ status: 'POSE_BANNED', posPenaltyScore: 200, updatedAt: '2026-11-24T10:00:00.000Z' })
    ]
    const census = masternodeCensus(nodes)
    expect(census).toMatchObject({ total: 4, enabled: 2, banned: 2, regular: 3, evo: 1, withPlatform: 1 })
    expect(census.medianPenalty).toBe(105)
    expect(census.countries).toEqual([{ country: 'DE', count: 2 }, { country: 'US', count: 1 }])
    expect(census.asOf).toBe(Date.parse('2026-11-24T10:00:00.000Z'))
  })

  test('survives an empty network', () => {
    expect(masternodeCensus([])).toMatchObject({ total: 0, enabled: 0, banned: 0, medianPenalty: null, asOf: null })
  })
})

const block = (height: number, timestamp: string, over: Partial<DashscanBlock> = {}): DashscanBlock => ({
  height,
  hash: `block-${height}`,
  timestamp,
  txCount: 2,
  size: 500,
  fees: 0,
  superblock: false,
  ...over
})

describe('blockActivity', () => {
  test('median block time over the slice, with the indexed height range and as-of date', () => {
    const blocks = [
      block(100, '2026-10-01T16:00:00.000Z'),
      block(101, '2026-10-01T16:02:40.000Z'), // +160 s
      block(102, '2026-10-01T16:05:00.000Z'), // +140 s
      block(103, '2026-10-01T16:07:30.000Z', { superblock: true, txCount: 4, fees: 1500 }) // +150 s
    ]
    const activity = blockActivity(blocks)
    expect(activity).toMatchObject({ count: 4, fromHeight: 100, toHeight: 103, medianSeconds: 150, txTotal: 10, superblocks: 1, feesTotal: 1500 })
    expect(activity.avgTx).toBe(2.5)
    expect(activity.asOf).toBe(Date.parse('2026-10-01T16:07:30.000Z'))
  })

  test('an empty slice has no pace and no date', () => {
    expect(blockActivity([])).toMatchObject({ count: 0, medianSeconds: null, avgTx: null, asOf: null })
  })
})

describe('transactionMix', () => {
  test('counts by type, most common first', () => {
    const tx = (type: string): DashscanTransaction => ({ hash: type, type, blockHeight: 1, timestamp: '2026-01-01T00:00:00.000Z', amount: '1' })
    expect(transactionMix([tx('CLASSIC'), tx('ProRegTx'), tx('CLASSIC')])).toEqual([
      { type: 'CLASSIC', count: 2 },
      { type: 'ProRegTx', count: 1 }
    ])
  })
})