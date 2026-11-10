import { describe, expect, test } from 'vitest'
import {
  ExtraPayload, Input, Network, Output, PrivateKey, Script, Transaction, TransactionType
} from 'dash-core-sdk'
import { randomBytes } from '@noble/hashes/utils'
import { signCompact } from './compactSignature'
import { MAX_DISSOLVE_FEE } from './consensus'
import { rawDigest } from './registration'
import { verifyDissolution, type DissolutionContext } from './dissolution'
import { signDissolutionWithKey } from './signDissolution'
import type { Join } from './types'

const PRO_TX_HASH = 'ab'.repeat(32)
const COLLATERAL_INDEX = 3
const PENALTY = 500_000_000
const FEE = 100_000

const keys = Array.from({ length: 3 }, () => new PrivateKey(randomBytes(32), Network.Testnet, true))
const amounts = [50_000_000_000, 30_000_000_000, 20_000_000_000]

function p2pkh (key: PrivateKey): Script {
  return Script.fromHex('76a914' + key.getPublicKey().getPublicKeyHash() + '88ac')
}

const members = keys.map((key, index) => ({
  id: `join-${index}`,
  amount: amounts[index],
  refundAddress: key.getPublicKey().getAddress(Network.Testnet),
  ownerAddress: key.getPublicKey().getAddress(Network.Testnet)
})) as unknown as Join[]

const ctx: DissolutionContext = {
  proTxHash: PRO_TX_HASH,
  collateralIndex: COLLATERAL_INDEX,
  members,
  earlyPeriodBlocks: 17_280,
  earlyPenalty: PENALTY,
  registeredHeight: 500,
  height: 510
}

interface BuildOptions {
  actorIndex?: number
  scriptSig?: Script
  /** Positive keeps the fee, negative pays out more than the collateral */
  fee?: number
  /** Added to the actor's refund after the tx is signed, to test tampering */
  actorDelta?: number
}

function build (options: BuildOptions = {}): Transaction {
  const actorIndex = options.actorIndex ?? 0
  const fee = options.fee ?? FEE
  const values = amounts.map((_, index) => index === actorIndex && index === 0
    ? amounts[0] - PENALTY
    : index === 0 ? amounts[0] - PENALTY : amounts[index] + Math.round(PENALTY * (index === 1 ? 0.6 : 0.4)))
  values[actorIndex] += (options.actorDelta ?? 0) - fee

  return new Transaction(
    [new Input(PRO_TX_HASH, COLLATERAL_INDEX, options.scriptSig ?? new Script(), 0xffffffff)],
    values.map((value, index) => new Output(BigInt(value), p2pkh(keys[index]))),
    0, 3, TransactionType.TRANSACTION_PROVIDER_DISSOLVE,
    new ExtraPayload.ProDisTx(1, PRO_TX_HASH, actorIndex, ['00'.repeat(65)])
  )
}

function sign (tx: Transaction, signerIndex = 0): string {
  const digest = rawDigest(tx.dissolveSignHash())
  const signature = signCompact(digest, keys[signerIndex])
  if (!(tx.extraPayload instanceof ExtraPayload.ProDisTx)) throw new Error('Expected a ProDisTx payload')
  tx.extraPayload.sigs = [signature]

  return tx.hex()
}

describe('verifyDissolution', () => {
  test('accepts a unilateral dissolution signed by the actor', () => {
    const verdict = verifyDissolution(ctx, sign(build()))

    expect(verdict.findings).toEqual([])
    expect(verdict.ok).toBe(true)
  })

  test('rejects an output changed after signing', () => {
    const signed = sign(build())
    const tampered = Transaction.fromHex(signed)
    tampered.outputs[0].satoshis += 1_000_000n

    expect(verifyDissolution(ctx, tampered.hex()).findings)
      .toContain('Signature 1 was not made by the share 1 owner key')
  })

  test('rejects a signature from another share owner', () => {
    expect(verifyDissolution(ctx, sign(build(), 1)).findings)
      .toContain('Signature 1 was not made by the share 1 owner key')
  })

  test('rejects an actor index the signature does not belong to', () => {
    expect(verifyDissolution(ctx, sign(build({ actorIndex: 1 }), 0)).findings)
      .toContain('Signature 1 was not made by the share 2 owner key')
  })

  test('rejects an input that carries a scriptSig or spends something else', () => {
    expect(verifyDissolution(ctx, sign(build({ scriptSig: Script.fromHex('51') }))).findings)
      .toContain('The input carries a scriptSig; a dissolution authorises through its payload signatures')
  })

  test('rejects a fee above the consensus cap and outputs above the collateral', () => {
    expect(verifyDissolution(ctx, sign(build({ fee: MAX_DISSOLVE_FEE + 1 }))).findings[0])
      .toContain('above the consensus cap')
    expect(verifyDissolution(ctx, sign(build({ fee: -1_000_000 }))).findings)
      .toContain('The outputs exceed the collateral by 1000000 duffs')
  })

  test('rejects a refund below what the share is owed', () => {
    // Move part of the second share's bonus into the actor's output: total, fee and signature stay valid
    const shifted = Math.round(PENALTY * 0.6) + 1
    const tx = build()
    tx.outputs[1].satoshis -= BigInt(shifted)
    tx.outputs[0].satoshis += BigInt(shifted)
    const paid = 30_000_000_000 + Math.round(PENALTY * 0.6) - shifted

    expect(verifyDissolution(ctx, sign(tx)).findings)
      .toContain(`Share 2 is refunded ${paid} duffs, at least 30000000000 expected`)
  })

  test('rejects input that is not the collateral and a non-dissolve payload', () => {
    const wrongInput = sign(new Transaction(
      [new Input(PRO_TX_HASH, 0, new Script(), 0xffffffff)],
      amounts.map((value, index) => new Output(BigInt(value), p2pkh(keys[index]))),
      0, 3, TransactionType.TRANSACTION_PROVIDER_DISSOLVE,
      new ExtraPayload.ProDisTx(1, PRO_TX_HASH, 0, ['00'.repeat(65)])
    ))

    expect(verifyDissolution(ctx, wrongInput).findings).toContain('The input does not spend this masternode’s collateral output')
    expect(verifyDissolution(ctx, 'deadbeef').findings).toEqual(['The pasted transaction cannot be parsed'])
  })

  test('a dissolution signed in the app with the actor key passes the verifier', () => {
    const signed = signDissolutionWithKey(ctx, 0, FEE, keys[0].toWIF())

    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    expect(verifyDissolution(ctx, signed.hex)).toEqual({ ok: true, findings: [] })
  })

  test('the app refuses a key that does not own the acting share', () => {
    const signed = signDissolutionWithKey(ctx, 0, FEE, keys[1].toWIF())

    expect(signed.ok).toBe(false)
    if (signed.ok) return
    expect(signed.error).toContain('not your share owner')
  })
})
