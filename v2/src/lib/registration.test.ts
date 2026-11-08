import { describe, expect, test } from 'vitest'
import { buildFundingTx } from './registration.js'
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