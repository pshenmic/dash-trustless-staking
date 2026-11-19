import { base58 } from '@scure/base'
import { describe, expect, test } from 'vitest'
import {
  cycleLocked, groupVotesByPool, isProposalHash, latestChoices, latestMemberChoices, lockHeight,
  nextSuperblockHeight, outcomeLabel, poolVoteSummary, proposalActivity, tally
} from './voting'
import type { Join, Vote, VoteOutcome } from './types'

const DASH = 100_000_000
const PROP1 = '5884221907e247d044102fbc3e20544b999ecbfc0fef3b4f8f4607da1f6f5abe'
const PROP2 = 'deadbeef'.repeat(8)
const idOf = (...prefix: number[]) => base58.encode(Uint8Array.from({ length: 32 }, (_, i) => prefix[i] ?? 0))
const vote = (ownerId: string, outcome: VoteOutcome, createdAt: number, over: Partial<Vote> = {}): Vote =>
  ({ id: idOf(1), ownerId, createdAt, poolId: 'pool', proposalHash: PROP1, outcome, ...over })
const member = (ownerId: string, dash: number): Join => ({
  id: `join-${ownerId}`, ownerId, createdAt: 0, poolId: 'pool', amount: dash * DASH,
  ownerAddress: 'yj5Z2cy5bGCva2DorKb8f4pJG7FoFSpBwk', refundAddress: 'yj5Z2cy5bGCva2DorKb8f4pJG7FoFSpBwk',
  inputs: [], changeAddress: 'yj5Z2cy5bGCva2DorKb8f4pJG7FoFSpBwk'
})

describe('latestChoices', () => {
  test('newest per member and proposal wins', () => {
    const old = vote('A', 1, 1000), newer = vote('A', 2, 2000)
    expect(latestChoices([old, newer])).toEqual([newer])
  })
  test('proposals and members stay separate', () => {
    const a = vote('A', 1, 1000), b = vote('A', 2, 1000, { proposalHash: PROP2 }), c = vote('B', 3, 1000)
    expect(latestChoices([a, b, c])).toHaveLength(3)
  })
  test('equal createdAt: greater id bytes wins, even against base58 string order', () => {
    // Verified pair: bytes [0,1,…] < [0,16,…], but the ids encode as 1tJ9… vs 1F9j… — strings sort the other way
    const low = vote('A', 1, 1000, { id: idOf(0, 1) })
    const high = vote('A', 2, 1000, { id: idOf(0, 16) })
    const bytesLess = (a: string, b: string) => {
      const x = base58.decode(a), y = base58.decode(b)
      for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] < y[i]
      return x.length < y.length
    }
    expect(bytesLess(low.id, high.id)).toBe(true)
    expect(low.id.localeCompare(high.id)).toBeGreaterThan(0)
    expect(latestChoices([low, high])).toEqual([high])
    expect(latestChoices([high, low])).toEqual([high])
  })
})

describe('latestMemberChoices', () => {
  const members = [member('A', 500), member('B', 300)]
  test('non-member documents never surface', () => {
    const mine = vote('A', 1, 1000)
    const stranger = vote('D', 2, 2000, { id: idOf(9), proposalHash: PROP2 })
    expect(latestMemberChoices([mine, stranger], members)).toEqual([mine])
  })
  test('only non-member documents is empty', () => {
    expect(latestMemberChoices([vote('D', 1, 1000, { id: idOf(9) })], members)).toEqual([])
  })
  test('newest per member still wins within the member set', () => {
    const old = vote('A', 1, 1000), newer = vote('A', 2, 2000)
    expect(latestMemberChoices([old, newer], members)).toEqual([newer])
  })
})

describe('tally', () => {
  const members = [member('A', 500), member('B', 300), member('C', 200)]
  test('stake-weighted majority', () => {
    expect(tally([vote('A', 1, 1), vote('B', 2, 1)], members)).toBe(1)
  })
  test('exact tie abstains (500 YES vs 300+200 NO)', () => {
    expect(tally([vote('A', 1, 1), vote('B', 2, 1), vote('C', 2, 1)], members)).toBe(3)
  })
  test('all abstain', () => {
    expect(tally([vote('A', 3, 1)], members)).toBe(3)
  })
  test('no choices is null, not abstain', () => {
    expect(tally([], members)).toBeNull()
  })
  test('non-member choices never count', () => {
    expect(tally([vote('A', 1, 1), vote('D', 2, 1, { id: idOf(9) })], members)).toBe(1)
  })
  test('only non-member choices is null', () => {
    expect(tally([vote('D', 1, 1, { id: idOf(9) })], members)).toBeNull()
  })
})

describe('superblock math', () => {
  test('mainnet boundaries (cycle 16616, window 1662, first 631408)', () => {
    expect(nextSuperblockHeight(100, 'mainnet')).toBe(631408)
    expect(nextSuperblockHeight(631407, 'mainnet')).toBe(631408)
    expect(nextSuperblockHeight(631408, 'mainnet')).toBe(648024)
    expect(lockHeight(629745, 'mainnet')).toBe(629746)
    expect(cycleLocked(629745, 'mainnet')).toBe(false)
    expect(cycleLocked(629746, 'mainnet')).toBe(true)
  })
  test('testnet boundaries (cycle 24, window 8, first 4200)', () => {
    expect(nextSuperblockHeight(4199, 'testnet')).toBe(4200)
    expect(nextSuperblockHeight(4200, 'testnet')).toBe(4224)
    expect(lockHeight(4215, 'testnet')).toBe(4216)
    expect(cycleLocked(4215, 'testnet')).toBe(false)
    expect(cycleLocked(4216, 'testnet')).toBe(true)
  })
})

describe('isProposalHash', () => {
  test('accepts 64 hex chars, either case', () => {
    expect(isProposalHash(PROP1)).toBe(true)
    expect(isProposalHash(PROP1.toUpperCase())).toBe(true)
  })
  test('rejects everything else', () => {
    for (const bad of ['', PROP1.slice(1), PROP1 + 'a', '0x' + PROP1.slice(2), PROP1.slice(0, 63) + 'g', ' ' + PROP1]) {
      expect(isProposalHash(bad)).toBe(false)
    }
  })
})

describe('outcomeLabel', () => {
  test('maps outcomes to labels', () => {
    expect(outcomeLabel(1)).toBe('YES')
    expect(outcomeLabel(2)).toBe('NO')
    expect(outcomeLabel(3)).toBe('ABSTAIN')
    expect(outcomeLabel(null)).toBe('No choice')
    expect(outcomeLabel(undefined)).toBe('No choice')
  })
})

describe('groupVotesByPool', () => {
  test('splits votes by pool, insertion order', () => {
    const v1 = vote('A', 1, 1000, { poolId: 'p1' })
    const v2 = vote('B', 2, 1000, { poolId: 'p2', id: idOf(2) })
    const m = groupVotesByPool([v1, v2])
    expect([...m.keys()]).toEqual(['p1', 'p2'])
    expect(m.get('p1')).toEqual([v1])
    expect(m.get('p2')).toEqual([v2])
  })
  test('empty is an empty map', () => {
    expect(groupVotesByPool([]).size).toBe(0)
  })
})

describe('poolVoteSummary', () => {
  const members = [member('A', 500), member('B', 300), member('C', 200)]
  test('stake-weighted tie with full participation', () => {
    const votes = [vote('A', 1, 1), vote('B', 2, 1, { id: idOf(2) }), vote('C', 2, 1, { id: idOf(3) }), vote('D', 1, 1, { id: idOf(9) })]
    const s = poolVoteSummary(members, votes)
    expect(s.tally).toBe(3)
    expect(s.votedStake).toBe(1000 * DASH)
    expect(s.totalStake).toBe(1000 * DASH)
    expect(s.choices).toHaveLength(3)
    expect(s.choices.some(c => c.ownerId === 'D')).toBe(false)
  })
  test('empty members and votes', () => {
    const s = poolVoteSummary([], [])
    expect(s.tally).toBeNull()
    expect(s.votedStake).toBe(0)
    expect(s.totalStake).toBe(0)
    expect(s.choices).toEqual([])
  })
})

describe('proposalActivity', () => {
  test('raw counts include superseded and non-member docs; distinct pools; sorted by last activity', () => {
    const votes = [
      vote('A', 1, 1000, { poolId: 'p1', proposalHash: PROP1 }),
      vote('A', 2, 2000, { poolId: 'p1', proposalHash: PROP1, id: idOf(2) }),
      vote('D', 1, 1500, { poolId: 'p2', proposalHash: PROP1, id: idOf(9) }),
      vote('B', 3, 3000, { poolId: 'p1', proposalHash: PROP2, id: idOf(3) })
    ]
    const act = proposalActivity(votes)
    expect(act.map(a => a.proposalHash)).toEqual([PROP2, PROP1])
    expect(act.find(a => a.proposalHash === PROP1)).toEqual({
      proposalHash: PROP1, lastActivity: 2000, poolCount: 2, choiceCount: 3, yes: 2, no: 1, abstain: 0
    })
    expect(act.find(a => a.proposalHash === PROP2)).toEqual({
      proposalHash: PROP2, lastActivity: 3000, poolCount: 1, choiceCount: 1, yes: 0, no: 0, abstain: 1
    })
  })
  test('empty is empty', () => {
    expect(proposalActivity([])).toEqual([])
  })
})