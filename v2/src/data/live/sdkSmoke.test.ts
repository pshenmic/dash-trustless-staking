import { describe, expect, test } from 'vitest'
import {
  CollateralShare,
  ExtraPayload,
  Input,
  OutPoint,
  Output,
  Script,
  SHARED_COLLATERAL_SCRIPT,
  Transaction,
  TransactionType,
  consentHash,
  signCompact,
  verifyCompact,
  dissolveSignHash
} from 'dash-core-sdk'

const P2PKH = '76a914' + 'aa'.repeat(20) + '88ac'

function sampleTx (): Transaction {
  const payload = new ExtraPayload.ProRegTX(
    3, 0, 0, new OutPoint('00'.repeat(32), 0xffffffff),
    undefined, undefined,
    'aa'.repeat(20), 'ab'.repeat(48), '12'.repeat(20), 0,
    Script.fromHex(P2PKH), '00'.repeat(32),
    undefined, undefined, undefined, '',
    {
      netInfo: undefined as never,
      payouts: [],
      shares: [
        new CollateralShare(60000000000n, Script.fromHex(P2PKH), Script.fromHex(P2PKH), 'aa'.repeat(20)),
        new CollateralShare(40000000000n, Script.fromHex(P2PKH), Script.fromHex(P2PKH), 'bb'.repeat(20))
      ],
      joinSigs: ['00'.repeat(65), '00'.repeat(65)],
      earlyPeriodBlocks: 420480,
      earlyPenalty: 1000000n
    }
  )

  return new Transaction(
    [new Input('11'.repeat(32), 0, new Script(), 0xffffffff)],
    [new Output(100000000000n, Script.fromHex(SHARED_COLLATERAL_SCRIPT))],
    0, 3, TransactionType.TRANSACTION_PROVIDER_REGISTER, payload
  )
}

describe('dash-core-sdk integration', () => {
  test('links the shared collateral script constant', () => {
    expect(SHARED_COLLATERAL_SCRIPT).toBe('04445348437551')
  })

  test('round-trips a v3 shared registration transaction', () => {
    const tx = sampleTx()
    const parsed = Transaction.fromHex(tx.hex())

    expect(parsed.hex()).toBe(tx.hex())
    expect(parsed.hash()).toBe(tx.hash())
  })

  test('computes the consent digest and compact signatures', () => {
    expect(consentHash(sampleTx())).toMatch(/^[0-9a-f]{64}$/)
    expect(typeof signCompact).toBe('function')
    expect(typeof verifyCompact).toBe('function')
    expect(typeof dissolveSignHash).toBe('function')
  })
})