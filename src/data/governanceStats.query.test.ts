import { beforeEach, expect, test, vi } from 'vitest'
import { createQuickPool, createTestVotes, mockBackend, resetMockState } from './mock/mockBackend'
import { MOCK_DISSOLVE_PREFIX, mockConsentHash, mockProTxHash } from './mock/mockTxBuilder'

vi.mock('./index', async () => ({ backend: (await import('./mock/mockBackend')).mockBackend }))
const { fetchGovernanceStats } = await import('./queries')

const DASH = 100_000_000
const STRANGER_HASH = 'b'.repeat(64)
beforeEach(() => resetMockState())

test('governance stats: hosted pools only, stranger-only proposals dropped', async () => {
  const p1 = createQuickPool(null)
  const p2 = createQuickPool(null)
  createTestVotes(p1.id)
  createTestVotes(p2.id)

  // A custom-voting-address pool with votes must be excluded from every stat
  const p3 = createQuickPool(null)
  createTestVotes(p3.id)
  const p3doc = await mockBackend.platform.getPool(p3.id)
  p3doc!.votingAddress = 'yCustomAddress1111111111111111111111111'

  // A stranger-only vote on a fresh hash must not surface a proposal
  await mockBackend.platform.createVote('Stranger1111111111111111111111111111111', { poolId: p1.id, proposalHash: STRANGER_HASH, outcome: 1 })

  const stats = await fetchGovernanceStats()
  expect(stats.overview.activePools).toBe(2)
  expect(stats.overview.totalPools).toBe(2)
  // "Choices recorded" and the trend must be hosted-member-scoped: p1 (5) + p2 (5) = 10;
  // the custom pool's 5 and the stranger's 1 are excluded
  expect(stats.overview.totalChoices).toBe(10)
  expect(stats.trend.reduce((s, t) => s + t.choices, 0)).toBe(10)
  expect(stats.proposals.length).toBe(2)
  expect(stats.proposals.some(p => p.proposalHash === STRANGER_HASH)).toBe(false)
  for (const p of stats.proposals) {
    expect(p.pools.length).toBe(1)
    expect(p.stake.yes + p.stake.no + p.stake.abstain).toBe(1000 * DASH)
  }
})

test('governance stats: a dissolved pool keeps its documents but drops out of every stat', async () => {
  const pool = createQuickPool(null)
  createTestVotes(pool.id)
  const joins = await mockBackend.platform.listJoinsByPools([pool.id])
  const proTxHash = mockProTxHash(mockConsentHash(pool, joins))
  await mockBackend.chain.broadcastTransaction(MOCK_DISSOLVE_PREFIX + proTxHash)

  // Dissolution is a Core event: the pool document and its votes stay on Platform
  expect((await mockBackend.platform.listPools()).some(p => p.id === pool.id)).toBe(true)
  expect(await mockBackend.platform.listVotes(pool.id)).not.toEqual([])

  const stats = await fetchGovernanceStats()
  expect(stats.overview.totalPools).toBe(0)
  expect(stats.overview.activePools).toBe(0)
  expect(stats.overview.totalChoices).toBe(0)
  expect(stats.proposals).toEqual([])
  expect(stats.leaderboard).toEqual([])
  expect(stats.trend.every(t => t.choices === 0)).toBe(true)
})

test('governance stats: empty sandbox is all zeros, no crash', async () => {
  const stats = await fetchGovernanceStats()
  expect(stats.overview.activePools).toBe(0)
  expect(stats.overview.totalChoices).toBe(0)
  expect(stats.proposals).toEqual([])
  expect(stats.leaderboard).toEqual([])
  expect(stats.trend).toHaveLength(30)
  expect(stats.trend.every(t => t.choices === 0)).toBe(true)
})