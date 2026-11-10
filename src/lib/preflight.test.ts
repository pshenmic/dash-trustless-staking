import { describe, expect, test } from 'vitest'
import {
  CollateralShare, ExtNetInfo, ExtraPayload, Input, OutPoint, Output, Script, SHARED_COLLATERAL_SCRIPT, Transaction,
  TransactionType
} from 'dash-core-sdk'
import { COLLATERAL } from './consensus'
import { finalTxProblems } from './preflight'
import type { Join } from './types'

const P2PKH = '76a914' + 'f5'.repeat(20) + '88ac'
const FEE = 20_000
const CHANGE = 3_334
const TXID = 'aa'.repeat(32)
const JOIN_SIG = '11'.repeat(65)

function build (options: { scriptSig?: string, collateralValue?: number, collateralIndex?: number, joinSigs?: string[] } = {}): { hex: string, collateralIndex: number } {
  const outputs = [
    new Output(BigInt(CHANGE), Script.fromHex(P2PKH)),
    new Output(BigInt(options.collateralValue ?? COLLATERAL), Script.fromHex(SHARED_COLLATERAL_SCRIPT))
  ].sort((a, b) => Number(b.satoshis - a.satoshis))
  const collateralIndex = options.collateralIndex ?? outputs.findIndex(o => o.script.hex() === SHARED_COLLATERAL_SCRIPT)

  const payload = new ExtraPayload.ProRegTX(
    3, 0, 0, new OutPoint('00'.repeat(32), collateralIndex), undefined as never, undefined as never,
    '00'.repeat(20), 'ab'.repeat(48), '12'.repeat(20), 0, new Script(), '00'.repeat(32),
    undefined, undefined, undefined, '',
    {
      netInfo: new ExtNetInfo(),
      payouts: [],
      shares: [new CollateralShare(BigInt(COLLATERAL), Script.fromHex(P2PKH), new Script(), 'ee'.repeat(20))],
      joinSigs: options.joinSigs ?? [JOIN_SIG],
      earlyPeriodBlocks: 420_480,
      earlyPenalty: 1_000_000n
    }
  )

  const inputs = [new Input(TXID, 0, Script.fromHex(options.scriptSig ?? '4730' + '00'.repeat(70)), 0xffffffff)]
  const tx = new Transaction(inputs, outputs, 0, 3, TransactionType.TRANSACTION_PROVIDER_REGISTER, payload)

  return { hex: tx.hex(), collateralIndex }
}

const members = [{ inputs: [{ txid: TXID, vout: 0 }] }] as unknown as Join[]
const inputValues = new Map([[`${TXID}:0`, COLLATERAL + CHANGE + FEE]])

describe('finalTxProblems', () => {
  test('is empty for a fully signed, correctly funded transaction', () => {
    expect(finalTxProblems(build(), members, inputValues)).toEqual([])
  })

  test('reports an unsigned input', () => {
    expect(finalTxProblems(build({ scriptSig: '' }), members, inputValues)).toContain('Input 1 has no signature')
  })

  test('reports a collateral output that pays the wrong amount or script', () => {
    expect(finalTxProblems(build({ collateralValue: COLLATERAL - 1 }), members, inputValues))
      .toContain(`The collateral output is ${COLLATERAL - 1} duffs, expected ${COLLATERAL}`)
    expect(finalTxProblems(build({ collateralIndex: 1 }), members, inputValues))
      .toContain('The collateral output does not pay the shared collateral script')
  })

  test('reports missing input values and outputs larger than inputs', () => {
    expect(finalTxProblems(build(), members, new Map())).toContain(`Missing value for input ${TXID.slice(0, 8)}…:0`)
    expect(finalTxProblems(build(), members, new Map([[`${TXID}:0`, COLLATERAL]])))
      .toContain(`The outputs exceed the inputs by ${CHANGE} duffs`)
  })

  test('reports a share signature that is not a real 65-byte signature', () => {
    // The SDK refuses to serialize a mismatched count, so the reachable bad shape is content
    expect(finalTxProblems(build({ joinSigs: ['00'.repeat(65)] }), members, inputValues))
      .toContain('Share signature 1 is not a 65-byte hex signature')
  })

  test('reports a malformed transaction and a missing collateral output', () => {
    expect(finalTxProblems({ hex: 'deadbeef', collateralIndex: 1 }, members, inputValues))
      .toEqual(['The combined transaction cannot be parsed'])
    expect(finalTxProblems(build({ collateralIndex: 9 }), members, inputValues)).toContain('The collateral output is missing')
  })
})