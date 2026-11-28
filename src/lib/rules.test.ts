import { describe, expect, test } from 'vitest'
import { DUFFS_PER_DASH } from './consensus'
import { selectionProblems, onchainOwnerProblems, poolTermProblems, shareOwnerConflicts } from './rules'
import type { Join, Pool } from './types'

const pool = { earlyPenalty: 0 } as Pool

const join = (ownerId: string, dash: number, n: number, over: Partial<Join> = {}): Join => ({
  id: `join-${n}`,
  ownerId,
  createdAt: 0,
  poolId: 'pool',
  amount: dash * DUFFS_PER_DASH,
  ownerAddress: `yOwner${n}`,
  refundAddress: `yRefund${n}`,
  inputs: [],
  changeAddress: `yChange${n}`,
  ...over
})

describe('selectionProblems', () => {
  test('two distinct members summing to the collateral are fine', () => {
    expect(selectionProblems(pool, [join('A', 500, 1), join('B', 500, 2)])).toEqual([])
  })

  test('the same identity twice is rejected — one share counts per identity', () => {
    const problems = selectionProblems(pool, [join('A', 500, 1), join('A', 500, 2)])
    expect(problems).toContain('Two shares come from the same identity')
  })

  test('distinct identities sharing an owner address are still rejected', () => {
    const problems = selectionProblems(pool, [
      join('A', 500, 1),
      join('B', 500, 2, { ownerAddress: 'yOwner1' })
    ])
    expect(problems).toContain('Two members use the same owner address')
  })
})

// A real testnet operator key (pool 5TUTBv) and the same key with its last byte flipped
const OPERATOR_KEY = 'b1861e7cebdb77ae860788edf2d8b80fda62bcd4647a4cee6841b753b7c438b4c084554b2d71703891092b6d9e509f05'

const validPool: Pool = {
  id: 'pool', ownerId: 'creator', createdAt: 1,
  operatorPubKey: OPERATOR_KEY,
  votingAddress: 'yTCALGQTFNsA4pMPLTKAWdaLRmxfGpbujY',
  operatorReward: 500,
  earlyPeriodBlocks: 420_480,
  earlyPenalty: 1_000_000,
  fee: 100_000,
  feePayer: 'members'
}

describe('poolTermProblems', () => {
  test('a well-formed pool has no problems', () => {
    expect(poolTermProblems(validPool, 'testnet')).toEqual([])
  })

  test('an operator key that is not a curve point is rejected', () => {
    expect(poolTermProblems({ ...validPool, operatorPubKey: OPERATOR_KEY.slice(0, -2) + '06' }, 'testnet'))
      .toContain('The operator key is not a valid BLS public key')
    expect(poolTermProblems({ ...validPool, operatorPubKey: '00'.repeat(48) }, 'testnet'))
      .toContain('The operator key is not a valid BLS public key')
  })

  test('terms outside the consensus range are rejected', () => {
    expect(poolTermProblems({ ...validPool, operatorReward: 10_001 }, 'testnet'))
      .toContain('The operator reward is 10001, outside 0–10000 basis points')
    expect(poolTermProblems({ ...validPool, earlyPenalty: DUFFS_PER_DASH * 100 }, 'testnet'))
      .toContain('The early penalty must be zero or more and below 100 DASH')
    expect(poolTermProblems({ ...validPool, earlyPeriodBlocks: 0 }, 'testnet'))
      .toContain('The pool charges an early penalty but has no early period')
    expect(poolTermProblems({ ...validPool, fee: 0 }, 'testnet'))
      .toContain('The registration fee is not a positive amount')
    expect(poolTermProblems({ ...validPool, service: '1.2.3.4' }, 'testnet'))
      .toContain('The service address is not an IPv4 address and port')
  })
})

describe('shareOwnerConflicts', () => {
  const other = [{ id: 'other', name: 'Other pool', ownerAddresses: ['yOwner2'] }]

  test('names the pool that already collects shares with the address', () => {
    expect(shareOwnerConflicts([join('A', 500, 1), join('B', 500, 2)], other, 'pool'))
      .toEqual([{ joinId: 'join-2', address: 'yOwner2', poolId: 'other', poolName: 'Other pool', locked: false }])
  })

  test('a conflict with a locked pool is flagged, so the caller can block', () => {
    expect(shareOwnerConflicts([join('B', 500, 2)], [{ ...other[0], locked: true }], 'pool')[0].locked).toBe(true)
  })

  test('ignores the pool being checked', () => {
    expect(shareOwnerConflicts([join('A', 500, 1)], [{ id: 'pool', name: 'This pool', ownerAddresses: ['yOwner1'] }], 'pool'))
      .toEqual([])
  })
})

describe('onchainOwnerProblems', () => {
  test('names the masternode that already holds the share owner key', () => {
    const owners = new Map([['yOwner2', 'f842cce8ab3040d16ba3708312ed3450b6c8de78a2c7eb5e2e6274384273eb1e']])
    expect(onchainOwnerProblems([join('A', 500, 1), join('B', 500, 2)], owners))
      .toEqual(['Share 2 uses yOwner2, already the owner key of masternode f842cce8…, so the network will reject this registration'])
  })

  test('an empty index reports nothing — unknown must not read as "taken"', () => {
    expect(onchainOwnerProblems([join('A', 500, 1)], new Map())).toEqual([])
  })
})