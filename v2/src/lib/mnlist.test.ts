import { describe, expect, test } from 'vitest'
import { parseMnListDiff, SimplifiedMNList } from './mnlist.js'
import fullDiff from './fixtures/mnlist-full-diff.json' with { type: 'json' }

const HASH_11 = '11' + 'aa'.repeat(30) + 'ba'
const HASH_22 = '22' + 'bb'.repeat(30) + 'ba'
const NEW_HASH = '44' + 'dd'.repeat(30) + 'da'
const OP_88 = '88' + '00'.repeat(47)

describe('parseMnListDiff', () => {
  test('parses a full diff sent on subscribe', () => {
    const diff = parseMnListDiff(fullDiff)

    expect(diff.baseBlockHash).toBe('00'.repeat(32))
    expect(diff.blockHash).toBe('aabbccddee000000000000000000000000000000000000000000000000000000')
    expect(diff.height).toBe(5000)
    expect(diff.deleted).toEqual([])
    expect(diff.added).toHaveLength(3)
  })

  test('maps a DAPI entry address from addresses.core_p2p', () => {
    const entry = parseMnListDiff(fullDiff).added[0]

    expect(entry.service).toBe('10.0.0.1:19999')
    expect(entry.isValid).toBe(true)
    expect(entry.proTxHash).toBe(HASH_11)
  })

  test('falls back to the deprecated service field', () => {
    expect(parseMnListDiff(fullDiff).added[1].service).toBe('10.0.0.2:19999')
  })

  test('maps isValid correctly', () => {
    const added = parseMnListDiff(fullDiff).added

    expect(added[0].isValid).toBe(true)
    expect(added[2].isValid).toBe(false)
  })

  test('sets height to null when cbTx is a raw hex string', () => {
    const rawDiff = { ...fullDiff, cbTx: '03ffff000000000000000000000000000000000000000000000000000000000000000000' }
    const diff = parseMnListDiff(rawDiff)

    expect(diff.height).toBeNull()
  })
})

describe('SimplifiedMNList', () => {
  test('builds a map from a full diff and returns entries by proTxHash', () => {
    const list = new SimplifiedMNList()
    list.apply(parseMnListDiff(fullDiff))

    expect(list.get(HASH_11)).toEqual({ proTxHash: HASH_11, isValid: true, service: '10.0.0.1:19999', operatorPubKey: '99' + '00'.repeat(47) })
    expect(list.get('00'.repeat(32))).toBeNull()
  })

  test('exposes height after a full diff', () => {
    const list = new SimplifiedMNList()
    list.apply(parseMnListDiff(fullDiff))

    expect(list.height).toBe(5000)
  })

  test('finds an entry by operator key', () => {
    const list = new SimplifiedMNList()
    list.apply(parseMnListDiff(fullDiff))

    expect(list.byOperatorKey('88' + '00'.repeat(47))).not.toBeNull()
    expect(list.byOperatorKey(OP_88)!.proTxHash).toBe(HASH_22)
    expect(list.byOperatorKey('ab'.repeat(48))).toBeNull()
  })

  test('applies an incremental diff that deletes and adds in share order', () => {
    const list = new SimplifiedMNList()
    list.apply(parseMnListDiff(fullDiff))

    list.apply({
      baseBlockHash: fullDiff.blockHash,
      blockHash: 'eeff'.repeat(16),
      height: 5001,
      deleted: [HASH_22],
      added: [{ proTxHash: NEW_HASH, isValid: true, service: '10.0.0.4:19999', operatorPubKey: OP_88 }]
    })

    expect(list.get(HASH_22)).toBeNull()
    expect(list.get(NEW_HASH)).not.toBeNull()
  })

  test('sets needsResync when the previous block hash does not match', () => {
    const list = new SimplifiedMNList()
    list.apply(parseMnListDiff(fullDiff))

    list.apply({
      baseBlockHash: 'ff'.repeat(32),
      blockHash: 'eeff'.repeat(16),
      height: 5001,
      deleted: [],
      added: []
    })

    expect(list.needsResync).toBe(true)
  })

  test('needsResync is false for a valid incremental diff', () => {
    const list = new SimplifiedMNList()
    list.apply(parseMnListDiff(fullDiff))

    list.apply({
      baseBlockHash: fullDiff.blockHash,
      blockHash: 'eeff'.repeat(16),
      height: 5001,
      deleted: [],
      added: []
    })

    expect(list.needsResync).toBe(false)
  })

  test('height starts at null and is set by the first full diff', () => {
    const list = new SimplifiedMNList()

    expect(list.height).toBeNull()
    expect(list.needsResync).toBe(false)
  })
})