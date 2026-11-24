import { base58 } from '@scure/base'
import { describe, expect, test } from 'vitest'
import { encodeAddress, keyIdToAddress } from './address'
import { toHex } from './bytes'
import { DUFFS_PER_DASH } from './consensus'
import { entriesProblems, lockEntryOf, packEntry, packingProblems, unpackEntries, unpackEntry } from './lockEntries'
import type { Join, Lock } from './types'

const id = (seed: number): string => base58.encode(Uint8Array.from({ length: 32 }, (_, i) => i === 0 ? seed : 0))
const hash = (seed: number): string => toHex(Uint8Array.from({ length: 32 }, (_, i) => i === 0 ? seed : 0))
const p2pkh = (seed: number): string => keyIdToAddress(Uint8Array.from({ length: 20 }, (_, i) => i === 0 ? seed : 0), 'testnet')
const p2sh = (seed: number): string => encodeAddress(Uint8Array.from({ length: 20 }, (_, i) => i === 0 ? seed : 0), 'p2sh', 'testnet')

const join = (over: Partial<Join> = {}): Join => ({
  id: id(1),
  ownerId: id(2),
  createdAt: 1,
  poolId: id(3),
  amount: 400 * DUFFS_PER_DASH,
  ownerAddress: p2pkh(4),
  refundAddress: p2pkh(5),
  inputs: [{ txid: hash(6), vout: 0 }],
  changeAddress: p2pkh(7),
  ...over
})

const lock = (entries: Lock['entries'], joinIds: string[]): Lock => ({
  id: id(8), ownerId: id(9), createdAt: 1, poolId: id(3), joinIds, entries
})

describe('packEntry', () => {
  test('a one-input P2PKH share packs into a schema-sized hex string', () => {
    const packed = packEntry(lockEntryOf(join()), 'testnet')
    // 182 bytes: 92 fixed + 26 refund + 1 reward + 26 change + 1 count + 36 input
    expect(packed).toHaveLength(364)
    expect(packed).toMatch(/^[0-9a-f]+$/)
  })

  test('a share with 24 inputs still fits the 2048-character field, 25 inputs do not', () => {
    const inputs = Array.from({ length: 24 }, (_, i) => ({ txid: hash(6 + i), vout: i }))
    expect(packEntry(lockEntryOf(join({ inputs })), 'testnet').length).toBeLessThanOrEqual(2048)
    const tooMany = Array.from({ length: 25 }, (_, i) => ({ txid: hash(40 + i), vout: i }))
    expect(() => packEntry(lockEntryOf(join({ inputs: tooMany })), 'testnet')).toThrow(/byte limit/)
  })

  test('a share that cannot be packed is reported while the creator is still choosing', () => {
    const tooMany = Array.from({ length: 25 }, (_, i) => ({ txid: hash(40 + i), vout: i }))
    expect(packingProblems([lockEntryOf(join({ inputs: tooMany }))], 'testnet')).toHaveLength(1)
    expect(packingProblems([lockEntryOf(join())], 'testnet')).toEqual([])
  })
})

describe('unpackEntry', () => {
  test('round-trips every field, the reward script and the input order', () => {
    const source = join({
      amount: 600 * DUFFS_PER_DASH,
      rewardAddress: p2sh(11),
      inputs: [{ txid: hash(6), vout: 2 }, { txid: hash(12), vout: 1 }]
    })
    expect(unpackEntry(packEntry(lockEntryOf(source), 'testnet'), 'testnet')).toEqual(lockEntryOf(source))
  })

  test('a reward script that equals the refund script stays explicit', () => {
    const source = join({ rewardAddress: join().refundAddress })
    const decoded = unpackEntry(packEntry(lockEntryOf(source), 'testnet'), 'testnet')
    expect(decoded.rewardAddress).toBe(source.refundAddress)
  })

  test('an absent reward script decodes as absent', () => {
    expect(unpackEntry(packEntry(lockEntryOf(join()), 'testnet'), 'testnet').rewardAddress).toBeUndefined()
  })

  test('a malformed string decodes to a null slot instead of throwing', () => {
    expect(unpackEntries(['zz', packEntry(lockEntryOf(join()), 'testnet')], 'testnet')).toEqual([
      null, lockEntryOf(join())
    ])
  })
})

describe('entriesProblems', () => {
  const member = join()
  const packed = packEntry(lockEntryOf(member), 'testnet')

  test('packed copies that match their joins are fine', () => {
    expect(entriesProblems(lock([unpackEntry(packed, 'testnet')], [member.id]), [member])).toEqual([])
  })

  test('a lock without entries is a legacy lock and has nothing to check', () => {
    expect(entriesProblems(lock(undefined, [member.id]), [member])).toEqual([])
  })

  test('a packed amount that differs from the join is reported', () => {
    const tampered = unpackEntry(packEntry(lockEntryOf(join({ amount: 500 * DUFFS_PER_DASH })), 'testnet'), 'testnet')
    expect(entriesProblems(lock([tampered], [member.id]), [member])).toContain('A packed share does not match its join document')
  })

  test('a packed share that names another join is reported', () => {
    const other = join({ id: id(33) })
    expect(entriesProblems(lock([unpackEntry(packed, 'testnet')], [other.id]), [other])).toContain(
      'The packed shares name different joins than the lock'
    )
  })

  test('the packed count must equal the number of named joins', () => {
    expect(entriesProblems(lock([unpackEntry(packed, 'testnet')], [member.id, id(34)]), [member])).toContain(
      'The lock packs 1 share but names 2 joins'
    )
  })

  test('an unreadable entry is reported', () => {
    expect(entriesProblems(lock([null], [member.id]), [member])).toContain('A packed share could not be read')
  })
})