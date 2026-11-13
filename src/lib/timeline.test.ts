import { describe, expect, test } from 'vitest'
import { poolTimeline } from './timeline.js'
import type { MemberState, PoolState } from '../data/queries.js'
import type { Consent, Funding, Join, Lock, Message, Pool } from './types.js'

const DASH = 100_000_000
/** Epoch-scale base so "oldest first" is meaningful against pool.createdAt */
const BASE = 1_700_000_000_000

const pool: Pool = {
  id: 'pool-1',
  ownerId: 'creator',
  createdAt: BASE,
  name: 'Test pool',
  description: '',
  operatorPubKey: 'a'.repeat(96),
  votingAddress: 'yVoting',
  operatorReward: 500,
  earlyPeriodBlocks: 17_280,
  earlyPenalty: 50_000_000,
  fee: 20_000,
  feePayer: 'members'
}

function joinAt (id: string, amount: number, at: number): Join {
  return {
    id,
    poolId: pool.id,
    ownerId: `owner-${id}`,
    createdAt: at,
    amount,
    ownerAddress: 'yOwner',
    refundAddress: 'yRefund',
    inputs: [],
    changeAddress: 'yChange'
  }
}

function lockAt (at: number): Lock {
  return { id: 'lock-1', poolId: pool.id, ownerId: pool.ownerId, joinIds: ['a', 'b'], createdAt: at }
}

function messageAt (id: string, ownerId: string, at: number, text: string): Message {
  return { id, channel: pool.id, ownerId, createdAt: at, text }
}

function consentAt (join: Join, at: number): Consent {
  return { id: `consent-${join.id}`, ownerId: join.ownerId, createdAt: at, lockId: 'lock-1', signature: 'sig' }
}

function fundingAt (join: Join, at: number): Funding {
  return { id: `funding-${join.id}`, ownerId: join.ownerId, createdAt: at, lockId: 'lock-1', scriptSigs: [] }
}

function memberAt (id: string, amount: number, times: { consentAt: number, fundingAt: number }): MemberState {
  const join = joinAt(id, amount, BASE + 1_000)
  return {
    join,
    shareIndex: 0,
    consent: consentAt(join, times.consentAt),
    funding: fundingAt(join, times.fundingAt)
  }
}

function stateFixture (patch: Partial<PoolState> = {}): PoolState {
  return {
    pool,
    joins: [],
    lock: null,
    members: [],
    feeFunding: null,
    lockProblems: [],
    registration: null,
    finalTx: null,
    regTx: null,
    masternode: null,
    registeredHeight: null,
    height: 1_000,
    status: 'NEW',
    dissolutionTxid: null,
    stage: null,
    consentCount: 0,
    fundingCount: 0,
    operatorKey: { masternode: null, otherPools: [] },
    prevouts: new Map(),
    broadcastProblems: [],
    ...patch
  }
}

function fundedState (): PoolState {
  const members = [
    memberAt('a', 500 * DASH, { consentAt: BASE + 4_000, fundingAt: BASE + 4_500 }),
    memberAt('b', 500 * DASH, { consentAt: BASE + 4_100, fundingAt: BASE + 4_200 })
  ]
  return stateFixture({ status: 'SIGNING', stage: 'broadcast', lock: lockAt(BASE + 3_000), members, consentCount: 2, fundingCount: 2 })
}

describe('poolTimeline', () => {
  test('merges messages with timestamped pool events, oldest first', () => {
    const state = stateFixture({ joins: [joinAt('a', 250 * DASH, BASE + 2_000)], lock: lockAt(BASE + 3_000) })
    const items = poolTimeline(state, [messageAt('m1', 'bob', BASE + 2_500, 'gm')])
    expect(items.map(item => item.kind)).toEqual(['event', 'event', 'message', 'event'])
    expect(items.map(item => item.at)).toEqual([BASE, BASE + 2_000, BASE + 2_500, BASE + 3_000])
  })

  test('a join line carries the amount', () => {
    const state = stateFixture({ joins: [joinAt('a', 250 * DASH, BASE + 2_000)] })
    expect(poolTimeline(state, [])[1].text).toBe('joined with 250 DASH')
  })

  test('all signatures in is stamped at the latest signature', () => {
    const items = poolTimeline(fundedState(), [])
    const event = items.find(item => item.kind === 'event' && item.id === 'all-signed')
    expect(event?.at).toBe(BASE + 4_500)
    // The summary must follow the last signature it summarises, even at the same millisecond
    const ids = items.map(item => item.id)
    expect(ids.indexOf('all-signed')).toBeGreaterThan(ids.indexOf('funding-a'))
  })

  test('chain facts are not in the timeline', () => {
    const items = poolTimeline(stateFixture({ status: 'FORMED', regTx: { txid: 'a'.repeat(64), height: 900 } }), [])
    expect(items.some(item => item.text.includes('block'))).toBe(false)
  })

  test('ties sort deterministically by id', () => {
    const state = stateFixture({
      joins: [joinAt('b', 100 * DASH, BASE + 2_000), joinAt('a', 100 * DASH, BASE + 2_000)]
    })
    const ids = poolTimeline(state, []).map(item => item.id)
    expect(ids.indexOf('join-a')).toBeLessThan(ids.indexOf('join-b'))
  })
})