import { beforeEach, expect, test, vi } from 'vitest'
import type { Join, Lock, Pool, Vote } from '../lib/types'

const mocks = vi.hoisted(() => ({
  getPool: vi.fn(), listJoins: vi.fn(), listLocks: vi.fn(),
  listPoolsByOperatorKey: vi.fn(), getBestBlockHeight: vi.fn(),
  getMasternodeByOperatorKey: vi.fn(),
  listVotesByProposal: vi.fn(), listPools: vi.fn(), listJoinsByPools: vi.fn(),
  listPoolMetas: vi.fn(), listPoolMetasByPools: vi.fn()
}))

vi.mock('./index', () => ({
  backend: {
    platform: {
      getPool: mocks.getPool, listJoins: mocks.listJoins, listLocks: mocks.listLocks,
      listPoolsByOperatorKey: mocks.listPoolsByOperatorKey,
      listVotesByProposal: mocks.listVotesByProposal, listPools: mocks.listPools, listJoinsByPools: mocks.listJoinsByPools,
      listPoolMetas: mocks.listPoolMetas, listPoolMetasByPools: mocks.listPoolMetasByPools
    },
    chain: {
      getBestBlockHeight: mocks.getBestBlockHeight,
      getMasternodeByOperatorKey: mocks.getMasternodeByOperatorKey
    },
    tx: {}
  }
}))

const { fetchPoolState, fetchProposalSentiment } = await import('./queries')

const POOL: Pool = {
  id: 'DofSRCyd6R3EeCc3koAWNeAxe1TpMPvPYEyawziGwRFz',
  ownerId: 'Gpj9qUUjwTtFipcMo6nVjk5nWznBc4t5bPKan9HXgTjk',
  createdAt: Date.now() - 86_400_000,
  name: 'QA pool',
  description: '',
  operatorPubKey: 'ab'.repeat(48),
  votingAddress: 'yTestVotingAddress1111111111111111111111111',
  operatorReward: 500,
  earlyPeriodBlocks: 17280,
  earlyPenalty: 500_000_000,
  fee: 10_000_000
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listJoins.mockResolvedValue([])
  mocks.listLocks.mockResolvedValue([])
  mocks.listPoolsByOperatorKey.mockResolvedValue([])
  mocks.getBestBlockHeight.mockResolvedValue(1_234_567)
  mocks.getMasternodeByOperatorKey.mockResolvedValue(null)
  mocks.listVotesByProposal.mockResolvedValue([])
  mocks.listPools.mockResolvedValue([])
  mocks.listJoinsByPools.mockResolvedValue([])
  mocks.listPoolMetas.mockResolvedValue([])
  mocks.listPoolMetasByPools.mockResolvedValue([])
})

test('uses a preloaded pool without fetching it', async () => {
  const state = await fetchPoolState(POOL.id, POOL)
  expect(mocks.getPool).not.toHaveBeenCalled()
  expect(state?.pool.id).toBe(POOL.id)
  expect(state?.height).toBe(1_234_567)
  expect(state?.status).toBe('NEW')
  expect(mocks.listJoins).toHaveBeenCalledWith(POOL.id)
})

test('returns null for a preloaded missing pool without any query', async () => {
  expect(await fetchPoolState(POOL.id, null)).toBeNull()
  for (const fn of Object.values(mocks)) expect(fn).not.toHaveBeenCalled()
})

test('fetches the pool when none is preloaded', async () => {
  mocks.getPool.mockResolvedValue(POOL)
  const state = await fetchPoolState(POOL.id)
  expect(mocks.getPool).toHaveBeenCalledTimes(1)
  expect(mocks.getPool).toHaveBeenCalledWith(POOL.id)
  expect(state?.pool.id).toBe(POOL.id)
})

const DASH = 100_000_000
const PROP = '5884221907e247d044102fbc3e20544b999ecbfc0fef3b4f8f4607da1f6f5abe'
const join = (id: string, ownerId: string, dash: number): Join => ({
  id, ownerId, createdAt: 0, poolId: POOL.id, amount: dash * DASH,
  ownerAddress: `yOwner${ownerId}`, refundAddress: `yRefund${ownerId}`,
  inputs: [{ txid: 'ab'.repeat(32), vout: 0 }], changeAddress: `yChange${ownerId}`
})
const LOCK: Lock = { id: 'lock-1', ownerId: POOL.ownerId, createdAt: 1, poolId: POOL.id, joinIds: ['join-A', 'join-B', 'join-C'] }
const v = (ownerId: string, outcome: 1 | 2 | 3, poolId = POOL.id): Vote =>
  ({ id: `vote-${ownerId}-${outcome}`, ownerId, createdAt: 1000, poolId, proposalHash: PROP, outcome })

test('sentiment: locked pool with valid joins yields a stake-weighted tally', async () => {
  mocks.listVotesByProposal.mockResolvedValue([v('A', 1), v('B', 2), v('C', 2)])
  mocks.listPools.mockResolvedValue([POOL])
  mocks.listLocks.mockResolvedValue([LOCK])
  mocks.listJoinsByPools.mockResolvedValue([join('join-A', 'A', 500), join('join-B', 'B', 300), join('join-C', 'C', 200)])
  const s = await fetchProposalSentiment(PROP)
  expect(s.pools).toHaveLength(1)
  expect(s.pools[0].tally).toBe(3) // 500 YES vs 300+200 NO → tie
  expect(s.pools[0].votedStake).toBe(1000 * DASH)
  expect(s.pools[0].totalStake).toBe(1000 * DASH)
  expect(s.overall).toEqual({ yes: 0, no: 0, abstain: 1 })
})

test('sentiment: a pool with no lock is skipped', async () => {
  mocks.listVotesByProposal.mockResolvedValue([v('A', 1)])
  mocks.listPools.mockResolvedValue([POOL])
  mocks.listLocks.mockResolvedValue([])
  mocks.listJoinsByPools.mockResolvedValue([join('join-A', 'A', 500)])
  const s = await fetchProposalSentiment(PROP)
  expect(s.pools).toEqual([])
  expect(s.overall).toEqual({ yes: 0, no: 0, abstain: 0 })
})

test('sentiment: votes referencing an unknown pool are skipped', async () => {
  mocks.listVotesByProposal.mockResolvedValue([v('A', 1, 'unknown-pool')])
  mocks.listPools.mockResolvedValue([POOL])
  mocks.listLocks.mockResolvedValue([LOCK])
  mocks.listJoinsByPools.mockResolvedValue([])
  const s = await fetchProposalSentiment(PROP)
  expect(s.pools).toEqual([])
})

test('sentiment: a locked pool with only non-member votes is skipped', async () => {
  mocks.listVotesByProposal.mockResolvedValue([v('D', 1)]) // D is not a locked member
  mocks.listPools.mockResolvedValue([POOL])
  mocks.listLocks.mockResolvedValue([LOCK])
  mocks.listJoinsByPools.mockResolvedValue([join('join-A', 'A', 500), join('join-B', 'B', 300), join('join-C', 'C', 200)])
  const s = await fetchProposalSentiment(PROP)
  expect(s.pools).toEqual([])
  expect(s.overall).toEqual({ yes: 0, no: 0, abstain: 0 })
})

test('sentiment: no votes is empty without fetching pools', async () => {
  mocks.listVotesByProposal.mockResolvedValue([])
  const s = await fetchProposalSentiment(PROP)
  expect(s.pools).toEqual([])
  expect(mocks.listPools).not.toHaveBeenCalled()
})