import { describe, expect, test } from 'vitest'
import { buildFundingTx } from './registration.js'
import { memberFeeShares } from './rules.js'
import type { Join, Outpoint, Pool } from './types.js'

function p2pkh (byte: string): string { return '76a914' + byte.repeat(20) + '88ac' }

function join (id: string, inputs: Outpoint[], byte: string, amount: number = 60_00000000): Join {
  return { id, poolId: 'p', ownerId: id, inputs, amount, refundAddress: p2pkh(byte), rewardAddress: p2pkh(byte), ownerAddress: p2pkh(byte), changeAddress: p2pkh(byte), votingKeyId: 'aa'.repeat(20), createdAt: 1 } as any
}

const pool: Pool = {
  id: 'p', ownerId: 'creator', votingAddress: 'yTest', operatorPubKey: 'ab'.repeat(48),
  service: '1.2.3.4:19999', fee: 100_000, earlyPeriodBlocks: 420480, earlyPenalty: 1_000_000,
  createdAt: 1, locked: true
} as any

describe('buildFundingTx', () => {
  test('orders inputs in share order and adds a change output per member', () => {
    const result = buildFundingTx(pool, [join('a', [{ txid: '11'.repeat(32), vout: 0 }], 'aa'), join('b', [{ txid: '22'.repeat(32), vout: 1 }], 'bb')], new Map([['11'.repeat(32) + ':0', 100_00000000], ['22'.repeat(32) + ':1', 100_00000000]]))
    expect(result.problems).toEqual([])
    expect(result.tx.inputs.length).toBe(2)
    expect(result.tx.inputs[0].txId).toBe('11'.repeat(32))
    expect(result.tx.outputs.length).toBe(2)
  })
  test('has no collateral output', () => {
    const r = buildFundingTx(pool, [join('x', [{ txid: 'aa'.repeat(32), vout: 0 }], 'cc')], new Map([['aa'.repeat(32) + ':0', 100_00000000]]))
    expect(r.tx.outputs.every(o => o.script.hex() !== '04445348437551')).toBe(true)
  })
  test('determinism', () => {
    const a = buildFundingTx(pool, [join('x', [{ txid: 'dd'.repeat(32), vout: 0 }], 'dd')], new Map([['dd'.repeat(32) + ':0', 90_00000000]]))
    const b = buildFundingTx(pool, [join('x', [{ txid: 'dd'.repeat(32), vout: 0 }], 'dd')], new Map([['dd'.repeat(32) + ':0', 90_00000000]]))
    expect(a.hex).toBe(b.hex)
  })
})

describe('memberFeeShares', () => {
  test('splits the fee and gives the remainder to the last member', () => {
    expect(memberFeeShares(20_001, 2)).toEqual([10_000, 10_001])
    expect(memberFeeShares(20_001, 4)).toEqual([5_000, 5_000, 5_000, 5_001])
  })

  test('gives members zero when the creator pays', () => {
    expect(memberFeeShares(20_000, 3, 'creator')).toEqual([0, 0, 0])
  })
})

describe('buildFundingTx with a creator-paid fee', () => {
  const creatorPool: Pool = { ...pool, fee: 100_000, feePayer: 'creator' }
  const a = join('a', [{ txid: '11'.repeat(32), vout: 0 }], 'aa', 60_00000000)
  const b = join('b', [{ txid: '22'.repeat(32), vout: 1 }], 'bb', 60_00000000)
  const feeOutpoint: Outpoint = { txid: 'cc'.repeat(32), vout: 0 }
  const values = (feeValue: number | null): Map<string, number | null> => new Map([
    ['11'.repeat(32) + ':0', 60_00000000],
    ['22'.repeat(32) + ':1', 60_00000000],
    ['cc'.repeat(32) + ':0', feeValue]
  ])

  test('adds the fee input and no change when it exactly covers the fee', () => {
    const result = buildFundingTx(creatorPool, [a, b], values(100_000), [feeOutpoint])

    expect(result.problems).toEqual([])
    expect(result.tx.inputs).toHaveLength(3)
    expect(result.tx.outputs).toHaveLength(0)
  })

  test('returns fee change to the creator change address', () => {
    const result = buildFundingTx(creatorPool, [a, b], values(105_000), [feeOutpoint], p2pkh('ee'))

    expect(result.problems).toEqual([])
    expect(result.tx.outputs).toHaveLength(1)
    expect(Number(result.tx.outputs[0].satoshis)).toBe(5_000)
    expect(result.tx.outputs[0].script.hex()).toBe(p2pkh('ee'))
  })

  test('requires a change address when the fee input leaves change', () => {
    expect(buildFundingTx(creatorPool, [a, b], values(105_000), [feeOutpoint]).problems)
      .toContain('The creator fee inputs leave change; enter a change address')
  })

  test('reports a short or missing fee input', () => {
    expect(buildFundingTx(creatorPool, [a, b], values(99_999), [feeOutpoint]).problems)
      .toContain('The creator fee inputs cover 99999 of 100000 duffs')
    expect(buildFundingTx(creatorPool, [a, b], values(null), []).problems)
      .toContain('The creator fee input is missing')
  })
})