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

  test('keeps the object-shaped height from older payloads', () => {
    const objectDiff = { ...fullDiff, cbTx: { height: 5000 } }
    expect(parseMnListDiff(objectDiff).height).toBe(5000)
  })
})

// Captured from the live testnet stream: DAPI forwards Core's `protx diff` JSON, where cbTx is the
// coinbase special transaction as hex, not an object with a height field
const LIVE_CBTX = '03000500010000000000000000000000000000000000000000000000000000000000000000ffffffff016affffffff03b6c28c03000000001976a914b489115851ca07a26a5ad8bac3cec3c7dbebd83188ac2ed5fd0300000000016af472a806000000001976a91464f2b2b84f62d68a2cd7f7f5fb2b5aa75ef716d788ac00000000cf0400663b1800d3cdffa2d3fb8eb2185e750ba31880af0520a67034d83e4d7c727c194ecd2d7ef1c93e755dc834ddbf5bb746364e90b29f2e04ce070190cb7801c1a316487cf2008940c3b6a86cb0f0909fc7956205f4965b30dc74ef77c2808947395bd2bdb1e078a18c5228e3658c0774f281a74500e210008fd87921bb4b7b80c3f12c0ccd6887ada1c589fc9ddc6c85af4723be74bf46cd8f2137f4de837c287c4218c5633dd865dacfb02200000000000000000000000000000000000000000000000000000000000000000000'

describe('parseMnListDiff — height', () => {
  test('reads the height out of a real cbTx hex', () => {
    expect(parseMnListDiff({ ...fullDiff, cbTx: LIVE_CBTX }).height).toBe(1588070)
  })

  test('the masternode list knows its height, which is what gates DISSOLVED', () => {
    const list = new SimplifiedMNList()
    list.apply(parseMnListDiff({ ...fullDiff, cbTx: LIVE_CBTX }))

    expect(list.height).toBe(1588070)
  })

  test('an unparseable cbTx leaves the height unknown', () => {
    expect(parseMnListDiff({ ...fullDiff, cbTx: 'deadbeef' }).height).toBeNull()
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