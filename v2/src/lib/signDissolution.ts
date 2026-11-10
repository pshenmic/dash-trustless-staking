import {
  ExtraPayload, Input, Network as CoreNetwork, Output, PrivateKey, Script, Transaction, TransactionType,
  dissolveSignHash, signCompact
} from 'dash-core-sdk'
import { addressToKeyId, addressToScript } from './address.js'
import { fromHex, toHex } from './bytes.js'
import type { DissolutionContext } from './dissolution.js'
import { rawDigest } from './registration.js'
import { previewUnilateralDissolve } from './rules.js'
import type { Duffs, Network } from './types.js'

const NETWORK: Network = 'testnet'

export type SignDissolutionResult = { ok: true, hex: string } | { ok: false, error: string }

function toScript (address: string): Script {
  return Script.fromHex(toHex(addressToScript(address, NETWORK)))
}

/**
 * Builds the unilateral ProDisTx the way Dash Core's wallet does (DESIGN.md §10) and signs it with the
 * actor's share owner key. The refunds come from the same preview the dialog shows, so what the user
 * reviews is exactly what gets signed.
 */
export function signDissolutionWithKey (
  ctx: DissolutionContext, actorIndex: number, fee: Duffs, privateKeyText: string
): SignDissolutionResult {
  const member = ctx.members[actorIndex]
  if (member == null) return { ok: false, error: `There is no share ${actorIndex + 1} in this pool` }

  let key: PrivateKey
  try {
    const text = privateKeyText.trim()
    key = /^[0-9a-fA-F]{64}$/.test(text)
      ? new PrivateKey(fromHex(text), CoreNetwork.Testnet, true)
      : PrivateKey.fromWIF(text)
  } catch {
    return { ok: false, error: 'Not a valid WIF or 64-character hex private key' }
  }

  const keyId = key.getPublicKey().getPublicKeyHash()
  const expected = toHex(addressToKeyId(member.ownerAddress, NETWORK))
  if (keyId !== expected) {
    return { ok: false, error: `This key owns another address (${keyId.slice(0, 8)}…), not your share owner ${expected.slice(0, 8)}…` }
  }

  const preview = previewUnilateralDissolve(
    ctx.members.map(m => m.amount), actorIndex, ctx.earlyPeriodBlocks, ctx.earlyPenalty,
    ctx.registeredHeight ?? ctx.height, ctx.height, fee
  )
  if (preview.actorReceives <= 0) {
    return { ok: false, error: `The ${fee} duff fee and the penalty leave nothing of your share` }
  }

  // Non-actor refunds in share order, the actor's remainder last
  const outputs: Output[] = []
  ctx.members.forEach((m, i) => {
    if (i !== actorIndex) outputs.push(new Output(BigInt(preview.refunds[i]), toScript(m.refundAddress)))
  })
  outputs.push(new Output(BigInt(preview.refunds[actorIndex]), toScript(member.refundAddress)))

  const payload = new ExtraPayload.ProDisTx(1, ctx.proTxHash, actorIndex, ['00'.repeat(65)])
  const tx = new Transaction(
    [new Input(ctx.proTxHash, ctx.collateralIndex, new Script(), 0xffffffff)],
    outputs,
    0, 3, TransactionType.TRANSACTION_PROVIDER_DISSOLVE,
    payload
  )
  payload.sigs = [signCompact(rawDigest(dissolveSignHash(tx, 1)), key)]

  return { ok: true, hex: tx.hex() }
}
