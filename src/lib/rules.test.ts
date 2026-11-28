import { describe, expect, test } from 'vitest'
import { encodeAddress } from './address'
import { DUFFS_PER_DASH } from './consensus'
import {
  entryFeeProblems, joinProblems, payoutScriptProblems, selectionProblems, onchainOwnerProblems,
  poolTermProblems, shareOwnerConflicts, validatePoolTerms
} from './rules'
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
describe('validatePoolTerms entry fee', () => {
  const terms = {
    service: '',
    operatorPubKey: 'ab'.repeat(48),
    votingAddress: 'yLzmKvXK3dsopAQMYGafo1wZY3qGj4ku7S',
    operatorReward: 500,
    earlyPeriodBlocks: 0,
    earlyPenalty: 0,
    fee: 20_000,
    feePayer: 'members' as const
  }

  test('no fee means no address is required', () => {
    const errors = validatePoolTerms({ ...terms, entryFee: 0 }, 'testnet')
    expect(errors.entryFee).toBeUndefined()
    expect(errors.entryFeeAddress).toBeUndefined()
  })

  test('a fee without a payout address is refused', () => {
    expect(validatePoolTerms({ ...terms, entryFee: 5 * DUFFS_PER_DASH }, 'testnet').entryFeeAddress)
      .toBe('Enter the testnet P2PKH address that receives it')
  })

  test('the per-member cap keeps eight shares inside 100 DASH', () => {
    expect(validatePoolTerms({ ...terms, entryFee: 12.5 * DUFFS_PER_DASH, entryFeeAddress: terms.votingAddress }, 'testnet').entryFee).toBeUndefined()
    expect(validatePoolTerms({ ...terms, entryFee: 12.6 * DUFFS_PER_DASH, entryFeeAddress: terms.votingAddress }, 'testnet').entryFee)
      .toBe('At most 12.5 DASH per member')
  })
})

describe('entryFeeProblems', () => {
  test('a pool without a fee has nothing to report', () => {
    expect(entryFeeProblems({ ...pool })).toEqual([])
  })

  test('a fee above the cap or without a payout address is named', () => {
    expect(entryFeeProblems({ ...pool, entryFee: 12.6 * DUFFS_PER_DASH, entryFeeAddress: 'yPool' }))
      .toEqual(['The entry fee of 12.6 DASH is above the 12.5 DASH limit'])
    expect(entryFeeProblems({ ...pool, entryFee: 5 * DUFFS_PER_DASH }))
      .toEqual(['The entry fee has no payout address'])
  })
})

describe('payoutScriptProblems — refund and reward scripts', () => {
  const hash = (n: number): Uint8Array => new Uint8Array(20).fill(n)
  const owner = encodeAddress(hash(1), 'p2pkh', 'testnet')
  const refund = encodeAddress(hash(2), 'p2pkh', 'testnet')
  const reward = encodeAddress(hash(3), 'p2pkh', 'testnet')
  const voting = encodeAddress(hash(4), 'p2pkh', 'testnet')
  const p2sh = encodeAddress(hash(5), 'p2sh', 'testnet')
  const base = { ownerAddress: owner, votingAddress: voting, network: 'testnet' as const, strict: true }

  test('a reward may be empty — the refund address is paid instead', () => {
    expect(payoutScriptProblems({ ...base, role: 'reward', address: '' })).toEqual([])
  })

  test('a refund may not be empty, because Core validates it as a script', () => {
    expect(payoutScriptProblems({ ...base, role: 'refund', address: '' })).toEqual(['A refund address is required'])
  })

  test('both accept P2PKH and P2SH, the only payout scripts Core allows', () => {
    expect(payoutScriptProblems({ ...base, role: 'refund', address: p2sh })).toEqual([])
    expect(payoutScriptProblems({ ...base, role: 'reward', address: p2sh })).toEqual([])
    expect(payoutScriptProblems({ ...base, role: 'reward', address: reward })).toEqual([])
  })

  test('anything else is refused before it becomes a script', () => {
    expect(payoutScriptProblems({ ...base, role: 'reward', address: 'not an address' }))
      .toEqual(['The reward address is not a testnet P2PKH or P2SH address'])
  })

  test('a share may not pay its own owner key or the voting key', () => {
    expect(payoutScriptProblems({ ...base, role: 'refund', address: owner }))
      .toEqual(['The refund address pays the share owner key'])
    expect(payoutScriptProblems({ ...base, role: 'reward', address: voting }))
      .toEqual(['The reward address pays the voting key'])
  })

  test('a reward may equal the refund — Core compares them only against owner and voting keys', () => {
    expect(payoutScriptProblems({ ...base, role: 'reward', address: refund })).toEqual([])
  })
})

describe('joinProblems — script rules apply to live documents only', () => {
  const hash = (n: number): Uint8Array => new Uint8Array(20).fill(n)
  const owner = encodeAddress(hash(1), 'p2pkh', 'testnet')
  const voting = encodeAddress(hash(4), 'p2pkh', 'testnet')
  const scriptPool = { id: 'pool', votingAddress: voting } as Pool
  const paidVoting = { ...join('A', 500, 1), ownerAddress: owner, refundAddress: owner, rewardAddress: voting }

  test('a reward that pays the voting key invalidates the join on live data', () => {
    expect(joinProblems(paidVoting, scriptPool, 'testnet')).toContain('The reward address pays the voting key')
  })

  test('without a network the placeholder addresses of the mock backend still pass', () => {
    expect(joinProblems(paidVoting, scriptPool)).not.toContain('The reward address pays the voting key')
  })
})
