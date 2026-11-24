import { base58 } from '@scure/base'
import { describe, expect, test } from 'vitest'
import { DUFFS_PER_DASH } from './consensus'
import { cumulativeSeries, homeStats } from './homeStats'
import type { Join, Lock, Pool } from './types'

const idOf = (n: number): string => base58.encode(Uint8Array.from({ length: 32 }, (_, i) => i === 0 ? n : 0))
const DASH = DUFFS_PER_DASH
const DAY = 24 * 60 * 60 * 1000
// A fixed "now": 24 Nov 2026, so buckets are predictable
const NOW = new Date(2026, 10, 24, 12).getTime()
const daysAgo = (days: number): number => NOW - days * DAY

const pool = (id: string, over: Partial<Pool> = {}): Pool => ({
  id,
  ownerId: 'pool-owner',
  createdAt: daysAgo(200),
  operatorPubKey: 'op-key',
  votingAddress: 'yVoting',
  operatorReward: 0,
  earlyPeriodBlocks: 0,
  earlyPenalty: 0,
  fee: 1_000_000,
  ...over
})

const join = (ownerId: string, dash: number, createdAt: number, over: Partial<Join> = {}): Join => ({
  id: idOf(9),
  ownerId,
  createdAt,
  poolId: 'p1',
  amount: dash * DASH,
  ownerAddress: `yOwner-${ownerId}`,
  refundAddress: `yRefund-${ownerId}`,
  // A join without a funding outpoint cannot exist on chain (schema minItems 36)
  inputs: [{ txid: 'ab'.repeat(32), vout: 0 }],
  changeAddress: `yChange-${ownerId}`,
  ...over
})

const lock = (poolId: string, ownerId: string, joinIds: string[], over: Partial<Lock> = {}): Lock => ({
  id: idOf(8),
  ownerId,
  createdAt: daysAgo(100),
  poolId,
  joinIds,
  ...over
})

describe('homeStats', () => {
  test('a topped-up share counts once in the pooled total', () => {
    const older = join('A', 300, daysAgo(120), { id: idOf(1) })
    const newer = join('A', 500, daysAgo(10), { id: idOf(2) })
    const stats = homeStats([pool('p1')], [], [older, newer])
    expect(stats.pooled).toBe(500 * DASH)
    expect(stats.shares).toBe(1)
    expect(stats.members).toBe(1)
    expect(stats.lockedPoints).toEqual([])
  })

  test('the same member in two pools is two shares and one member', () => {
    const here = join('A', 400, daysAgo(30), { id: idOf(1), poolId: 'p1' })
    const there = join('A', 600, daysAgo(20), { id: idOf(2), poolId: 'p2' })
    const stats = homeStats([pool('p1'), pool('p2')], [], [here, there])
    expect(stats.shares).toBe(2)
    expect(stats.members).toBe(1)
    expect(stats.pooled).toBe(1000 * DASH)
  })

  test('locked sums only the joins the lock names', () => {
    const selected = join('A', 600, daysAgo(30), { id: idOf(1) })
    const unselected = join('B', 900, daysAgo(30), { id: idOf(2) })
    const stats = homeStats([pool('p1')], [lock('p1', 'pool-owner', [selected.id])], [selected, unselected])
    expect(stats.locked).toBe(600 * DASH)
    expect(stats.lockedPools).toBe(1)
    expect(stats.openPools).toBe(0)
    expect(stats.lockedPoints).toEqual([{ at: selected.createdAt, amount: 600 * DASH }])
    expect(stats.lockedOperators).toEqual(['op-key'])
  })

  test('a lock naming a share a later top-up superseded still counts that share', () => {
    const locked = join('A', 600, daysAgo(40), { id: idOf(1) })
    const topUp = join('A', 900, daysAgo(5), { id: idOf(2) })
    const stats = homeStats([pool('p1')], [lock('p1', 'pool-owner', [locked.id])], [locked, topUp])
    expect(stats.locked).toBe(600 * DASH)
    expect(stats.lockedPoints).toEqual([{ at: locked.createdAt, amount: 600 * DASH }])
  })

  test('a lock naming a join of another pool counts nothing', () => {
    const foreign = join('A', 500, daysAgo(30), { id: idOf(1), poolId: 'p2' })
    const stats = homeStats([pool('p1')], [lock('p1', 'pool-owner', [foreign.id])], [foreign])
    expect(stats.locked).toBe(0)
    expect(stats.lockedPoints).toEqual([])
  })

  test('a lock by anyone but the pool owner leaves the pool open', () => {
    const a = join('A', 500, daysAgo(30), { id: idOf(1) })
    const stats = homeStats([pool('p1')], [lock('p1', 'stranger', [a.id])], [a])
    expect(stats.lockedPools).toBe(0)
    expect(stats.openPools).toBe(1)
    expect(stats.locked).toBe(0)
    expect(stats.lockedOperators).toEqual([])
  })

  test('no pools yields zeros and no points', () => {
    const stats = homeStats([], [], [])
    expect(stats).toMatchObject({ pools: 0, openPools: 0, lockedPools: 0, pooled: 0, locked: 0, shares: 0, members: 0 })
    expect(stats.lockedPoints).toEqual([])
    expect(stats.lockedOperators).toEqual([])
  })
})

describe('cumulativeSeries', () => {
  test('seven days is seven daily points, carrying older shares into the first', () => {
    const series = cumulativeSeries([{ at: daysAgo(100), amount: 400 * DASH }, { at: daysAgo(5), amount: 600 * DASH }], 7, NOW)
    expect(series).toHaveLength(7)
    expect(series[0].total).toBe(400 * DASH)
    expect(series.at(-1)?.total).toBe(1000 * DASH)
    expect(series.at(-1)?.at).toBe(NOW)
  })

  test('two weeks and a month stay daily', () => {
    expect(cumulativeSeries([], 14, NOW)).toHaveLength(14)
    expect(cumulativeSeries([], 30, NOW)).toHaveLength(30)
  })

  test('three and six months bucket weekly and still end at the total', () => {
    const series = cumulativeSeries([{ at: daysAgo(10), amount: 500 * DASH }], 180, NOW)
    expect(series).toHaveLength(26)
    expect(series[0].total).toBe(0)
    expect(series.at(-1)?.total).toBe(500 * DASH)
    // Every bucket after the share landed carries it
    expect(series.filter(point => point.at >= daysAgo(10)).every(point => point.total === 500 * DASH)).toBe(true)
  })

  test('an empty set still spans the window with zeros', () => {
    const series = cumulativeSeries([], 7, NOW)
    expect(series).toHaveLength(7)
    expect(series.every(point => point.total === 0)).toBe(true)
  })
})