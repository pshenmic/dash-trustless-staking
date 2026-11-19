import type { PoolSentiment } from '../data/queries'
import { BLOCK_TIME_SECONDS } from './consensus'
import type { Join, Network, Pool, Vote } from './types'
import { lockHeight } from './voting'

/*
 * Network-wide governance statistics for the dashboard, computed from Platform documents only
 * (votes + pools' joins/locks). Pure helpers so they are unit-testable; fetchGovernanceStats in
 * data/queries.ts gathers the inputs. Hosted-pool scope is applied by the caller.
 */

export interface OutcomeSplit { yes: number, no: number, abstain: number }

export interface Participation {
  poolsVoted: number
  totalPools: number
  stakeVoted: number
  totalStake: number
  membersVoted: number
  totalMembers: number
}

export interface ProposalStats {
  proposalHash: string
  pools: PoolSentiment[]
  stake: OutcomeSplit
  count: OutcomeSplit
  participation: Participation
  /** Normalized |yes − no| / total stake; smaller = more contested */
  margin: number
  leading: 'yes' | 'no' | 'tied'
  lastActivity: number
}

export interface Overview {
  activePools: number
  totalPools: number
  proposalCount: number
  totalChoices: number
  stakeVoting: number
  height: number
  lockHeight: number
  timeToLockMs: number
}

export interface GovernanceStats {
  overview: Overview
  proposals: ProposalStats[]
  leaderboard: Array<{ pool: Pool, voteCount: number, turnout: number }>
  trend: Array<{ day: number, choices: number }>
}

const split = (): OutcomeSplit => ({ yes: 0, no: 0, abstain: 0 })
const keyOf = (tally: 1 | 2 | 3): keyof OutcomeSplit => tally === 1 ? 'yes' : tally === 2 ? 'no' : 'abstain'

/** Stake (full collateral) and pool count by tally outcome; null tallies skipped */
export function aggregateProposal (pools: PoolSentiment[]): { stake: OutcomeSplit, count: OutcomeSplit, margin: number, leading: 'yes' | 'no' | 'tied' } {
  const stake = split()
  const count = split()
  for (const p of pools) {
    if (p.tally == null) continue
    const k = keyOf(p.tally)
    stake[k] += p.totalStake
    count[k] += 1
  }
  const total = stake.yes + stake.no + stake.abstain
  const margin = Math.abs(stake.yes - stake.no) / (total || 1)
  const leading = stake.yes > stake.no ? 'yes' : stake.no > stake.yes ? 'no' : 'tied'
  return { stake, count, margin, leading }
}

/** Engagement: pools/stake/members that actually recorded a choice, against hosted denominators */
export function proposalParticipation (pools: PoolSentiment[], totalPools: number, totalStake: number, totalMembers: number): Participation {
  return {
    poolsVoted: pools.filter(p => p.choices.length > 0).length,
    totalPools,
    stakeVoted: pools.reduce((s, p) => s + p.votedStake, 0),
    totalStake,
    membersVoted: pools.reduce((s, p) => s + p.choices.length, 0),
    totalMembers
  }
}

/** Recorded choices per bucket over a continuous window ending today (zeros included), ascending */
export function voteTrend (votes: Vote[], bucketMs: number, days = 30, now = Date.now()): Array<{ day: number, choices: number }> {
  const counts = new Map<number, number>()
  for (const v of votes) {
    const day = Math.floor(v.createdAt / bucketMs) * bucketMs
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  const today = Math.floor(now / bucketMs) * bucketMs
  const out: Array<{ day: number, choices: number }> = []
  for (let i = days - 1; i >= 0; i--) {
    const day = today - i * bucketMs
    out.push({ day, choices: counts.get(day) ?? 0 })
  }
  return out
}

/** Pools ranked by raw vote count; turnout = distinct members who chose / member count */
export function poolLeaderboard (votes: Vote[], pools: Pool[], membersByPool: Map<string, Join[]>): Array<{ pool: Pool, voteCount: number, turnout: number }> {
  const countByPool = new Map<string, number>()
  const votersByPool = new Map<string, Set<string>>()
  for (const v of votes) {
    countByPool.set(v.poolId, (countByPool.get(v.poolId) ?? 0) + 1)
    if ((membersByPool.get(v.poolId) ?? []).some(m => m.ownerId === v.ownerId)) {
      const set = votersByPool.get(v.poolId) ?? new Set<string>()
      set.add(v.ownerId)
      votersByPool.set(v.poolId, set)
    }
  }
  return pools.map(pool => {
    const members = membersByPool.get(pool.id) ?? []
    const voters = votersByPool.get(pool.id)?.size ?? 0
    return { pool, voteCount: countByPool.get(pool.id) ?? 0, turnout: members.length > 0 ? voters / members.length : 0 }
  }).sort((a, b) => b.voteCount - a.voteCount)
}

/** Overview cards: active pools (≥1 member choice), stake voting, proposals, choices, time to lock */
export function governanceOverview (pools: Pool[], membersByPool: Map<string, Join[]>, votes: Vote[], height: number, network: Network): Overview {
  const isMemberVote = (v: Vote): boolean => (membersByPool.get(v.poolId) ?? []).some(m => m.ownerId === v.ownerId)
  const memberVotes = votes.filter(isMemberVote)
  const activeIds = new Set(memberVotes.map(v => v.poolId))
  const totalStakeOf = (poolId: string): number => (membersByPool.get(poolId) ?? []).reduce((s, j) => s + j.amount, 0)
  const lock = lockHeight(height, network)
  return {
    activePools: pools.filter(p => activeIds.has(p.id)).length,
    totalPools: pools.length,
    proposalCount: new Set(memberVotes.map(v => v.proposalHash)).size,
    totalChoices: memberVotes.length,
    stakeVoting: pools.filter(p => activeIds.has(p.id)).reduce((s, p) => s + totalStakeOf(p.id), 0),
    height,
    lockHeight: lock,
    timeToLockMs: Math.max(0, lock - height) * BLOCK_TIME_SECONDS * 1000
  }
}