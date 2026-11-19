import { beforeEach, expect, test, vi } from 'vitest'
import { createQuickPool, createTestVotes, mockUsernames, resetMockState } from './mockBackend'
import { HOSTING_VOTING_ADDRESS } from '../../hosting'

vi.mock('../index', async () => ({ backend: (await import('./mockBackend')).mockBackend }))
const { fetchPoolState } = await import('../queries')

const OWNER = 'TestOwner1111111111111111111111111111111111'
beforeEach(() => resetMockState())

test('quick pool reads FORMED with the owner as one of 5 members', async () => {
  const pool = createQuickPool(OWNER)
  expect(pool.votingAddress).toBe(HOSTING_VOTING_ADDRESS)
  const state = await fetchPoolState(pool.id)
  expect(state?.status).toBe('FORMED')
  expect(state?.members).toHaveLength(5)
  expect(state?.members.map(m => m.join.ownerId)).toContain(OWNER)
})

test('quick pool with no login still has 5 distinct members and is FORMED', async () => {
  const pool = createQuickPool(null)
  const state = await fetchPoolState(pool.id)
  expect(state?.status).toBe('FORMED')
  expect(new Set(state?.members.map(m => m.join.ownerId)).size).toBe(5)
})

test('quick pool owned by a mock identity keeps 5 distinct members (owner not duplicated)', async () => {
  const alice = Object.entries(mockUsernames()).find(([, name]) => name === 'alice.dash')![0]
  const pool = createQuickPool(alice)
  const state = await fetchPoolState(pool.id)
  expect(state?.status).toBe('FORMED')
  const ids = state!.members.map(m => m.join.ownerId)
  expect(ids).toHaveLength(5)
  expect(new Set(ids).size).toBe(5)
  expect(ids.filter(id => id === alice)).toHaveLength(1)
})

test('test votes cover every locked member on a fresh proposal; repeats add proposals', async () => {
  const pool = createQuickPool(OWNER)
  const votes = createTestVotes(pool.id)
  const state = await fetchPoolState(pool.id)
  const memberIds = state!.members.map(m => m.join.ownerId)
  expect(votes).toHaveLength(5)
  expect(votes.map(v => v.ownerId).sort()).toEqual([...memberIds].sort())
  expect(new Set(votes.map(v => v.proposalHash)).size).toBe(1)
  const more = createTestVotes(pool.id)
  expect(more[0].proposalHash).not.toBe(votes[0].proposalHash)
})

test('test votes on a pool with no lock returns empty', () => {
  expect(createTestVotes('nonexistent-pool')).toEqual([])
})