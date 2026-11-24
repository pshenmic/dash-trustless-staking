import { describe, expect, test } from 'vitest'
import { aggregateProposal, governanceOverview, poolLeaderboard, proposalParticipation, voteTrend } from './governanceStats'
import type { PoolSentiment } from '../data/queries'
import type { DisplayPool } from './poolName'
import type { Join, Vote, VoteOutcome } from './types'

const DASH = 100_000_000
const HASH = 'a'.repeat(64)
const pool = (id: string): DisplayPool => ({
  id, ownerId: 'owner', createdAt: 0, name: id, description: '', archived: false, operatorPubKey: 'ab'.repeat(48),
  votingAddress: 'yVoting', operatorReward: 500, earlyPeriodBlocks: 17280, earlyPenalty: 5 * DASH, fee: 20000
})
const join = (poolId: string, ownerId: string, dash: number): Join => ({
  id: `j-${poolId}-${ownerId}`, ownerId, createdAt: 0, poolId, amount: dash * DASH,
  ownerAddress: 'yO', refundAddress: 'yR', inputs: [], changeAddress: 'yC'
})
const vote = (poolId: string, ownerId: string, outcome: VoteOutcome, createdAt = 1000, proposalHash = HASH): Vote => ({
  id: `v-${poolId}-${ownerId}-${createdAt}`, ownerId, createdAt, poolId, proposalHash, outcome
})
const sentiment = (p: DisplayPool, tally: VoteOutcome | null, totalStake: number, votedStake: number, choices: Vote[]): PoolSentiment =>
  ({ pool: p, choices, tally, votedStake, totalStake })

describe('aggregateProposal', () => {
  test('stake and count by tally, leading yes', () => {
    const pools = [
      sentiment(pool('p1'), 1, 1000 * DASH, 1000 * DASH, [vote('p1', 'A', 1)]),
      sentiment(pool('p2'), 1, 1000 * DASH, 1000 * DASH, [vote('p2', 'B', 1)]),
      sentiment(pool('p3'), 2, 1000 * DASH, 1000 * DASH, [vote('p3', 'C', 2)])
    ]
    const a = aggregateProposal(pools)
    expect(a.stake).toEqual({ yes: 2000 * DASH, no: 1000 * DASH, abstain: 0 })
    expect(a.count).toEqual({ yes: 2, no: 1, abstain: 0 })
    expect(a.leading).toBe('yes')
  })
  test('equal yes/no is tied with margin 0', () => {
    const pools = [
      sentiment(pool('p1'), 1, 1000 * DASH, 1000 * DASH, [vote('p1', 'A', 1)]),
      sentiment(pool('p2'), 2, 1000 * DASH, 1000 * DASH, [vote('p2', 'B', 2)])
    ]
    const a = aggregateProposal(pools)
    expect(a.leading).toBe('tied')
    expect(a.margin).toBe(0)
  })
  test('normalized margin: 60/40 split is 0.2', () => {
    const pools = ([1, 1, 1, 2, 2] as VoteOutcome[]).map((o, i) =>
      sentiment(pool('p' + i), o, 1000 * DASH, 1000 * DASH, [vote('p' + i, 'm' + i, o)]))
    expect(aggregateProposal(pools).margin).toBeCloseTo(0.2)
  })
  test('null tally is skipped', () => {
    const a = aggregateProposal([sentiment(pool('p1'), null, 1000 * DASH, 0, [])])
    expect(a.stake).toEqual({ yes: 0, no: 0, abstain: 0 })
    expect(a.count).toEqual({ yes: 0, no: 0, abstain: 0 })
  })
})

describe('proposalParticipation', () => {
  test('computes from choices, denominators passed through', () => {
    const pools = [
      sentiment(pool('p1'), 1, 1000 * DASH, 400 * DASH, [vote('p1', 'A', 1), vote('p1', 'B', 1)]),
      sentiment(pool('p2'), null, 1000 * DASH, 0, [])
    ]
    const p = proposalParticipation(pools, 5, 5000 * DASH, 25)
    expect(p.poolsVoted).toBe(1)
    expect(p.stakeVoted).toBe(400 * DASH)
    expect(p.membersVoted).toBe(2)
    expect(p.totalPools).toBe(5)
    expect(p.totalStake).toBe(5000 * DASH)
    expect(p.totalMembers).toBe(25)
  })
})

describe('voteTrend', () => {
  test('continuous 30-day window ending today, zeros included, ascending', () => {
    const day = 86_400_000
    const now = 100 * day + 12_345
    const votes = [vote('p1', 'A', 1, 99 * day + 5), vote('p1', 'B', 1, 99 * day + 10), vote('p1', 'C', 2, 100 * day + 5)]
    const t = voteTrend(votes, day, 30, now)
    expect(t).toHaveLength(30)
    expect(t[0]).toEqual({ day: 71 * day, choices: 0 })
    expect(t[28]).toEqual({ day: 99 * day, choices: 2 })
    expect(t[29]).toEqual({ day: 100 * day, choices: 1 })
  })
})

describe('poolLeaderboard', () => {
  test('ranks by vote count; turnout is distinct voters over members', () => {
    const pools = [pool('p1'), pool('p2')]
    const members = new Map([
      ['p1', [join('p1', 'A', 200), join('p1', 'B', 200)]],
      ['p2', [join('p2', 'C', 200), join('p2', 'D', 200)]]
    ])
    const votes = [vote('p1', 'A', 1), vote('p1', 'A', 2), vote('p1', 'B', 1), vote('p2', 'C', 1)]
    const lb = poolLeaderboard(votes, pools, members)
    expect(lb[0].pool.id).toBe('p1')
    expect(lb[0].voteCount).toBe(3)
    expect(lb[0].turnout).toBe(1) // A and B both voted: 2/2
    expect(lb[1].pool.id).toBe('p2')
    expect(lb[1].voteCount).toBe(1)
    expect(lb[1].turnout).toBe(0.5) // only C of C,D: 1/2
  })
})

describe('governanceOverview', () => {
  test('active pools, stake voting, proposal count, time to lock', () => {
    const pools = [pool('p1'), pool('p2'), pool('p3')]
    const members = new Map([
      ['p1', [join('p1', 'A', 200)]],
      ['p2', [join('p2', 'B', 200)]],
      ['p3', [join('p3', 'C', 200)]]
    ])
    const votes = [vote('p1', 'A', 1), vote('p2', 'B', 2)] // p3 has no member choice
    const o = governanceOverview(pools, members, votes, 1_312_400, 'testnet')
    expect(o.activePools).toBe(2)
    expect(o.totalPools).toBe(3)
    expect(o.totalChoices).toBe(2)
    expect(o.proposalCount).toBe(1)
    expect(o.stakeVoting).toBe(400 * DASH)
    expect(o.lockHeight).toBe(1_312_408)
    expect(o.timeToLockMs).toBeGreaterThanOrEqual(0)
  })
})