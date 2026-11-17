import { beforeEach, expect, test, vi } from 'vitest'
import type { Pool } from '../lib/types'

const mocks = vi.hoisted(() => ({
  getPool: vi.fn(), listJoins: vi.fn(), listLocks: vi.fn(),
  listPoolsByOperatorKey: vi.fn(), getBestBlockHeight: vi.fn(),
  getMasternodeByOperatorKey: vi.fn()
}))

vi.mock('./index', () => ({
  backend: {
    platform: {
      getPool: mocks.getPool, listJoins: mocks.listJoins, listLocks: mocks.listLocks,
      listPoolsByOperatorKey: mocks.listPoolsByOperatorKey
    },
    chain: {
      getBestBlockHeight: mocks.getBestBlockHeight,
      getMasternodeByOperatorKey: mocks.getMasternodeByOperatorKey
    },
    tx: {}
  }
}))

const { fetchPoolState } = await import('./queries')

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