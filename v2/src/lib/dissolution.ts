import { ExtraPayload, Transaction, dissolveSignHash, verifyCompact } from 'dash-core-sdk'
import { addressToKeyId, addressToScript } from './address.js'
import { toHex } from './bytes.js'
import { MAX_DISSOLVE_FEE } from './consensus.js'
import { rawDigest } from './registration.js'
import type { Duffs, Join } from './types.js'

/** Everything needed to check a pasted unilateral dissolution against the pool as it stands */
export interface DissolutionContext {
  proTxHash: string
  collateralIndex: number
  /** The share table in order: amounts, refund scripts and owner keys */
  members: Join[]
  earlyPeriodBlocks: number
  earlyPenalty: Duffs
  registeredHeight: number | null
  height: number
}

export interface DissolutionVerdict {
  ok: boolean
  findings: string[]
}

/**
 * Checks a ProDisTx built and signed in a wallet: it must spend this masternode's collateral, refund
 * every share, keep the fee within the consensus cap, and carry a compact signature by the actor (or by
 * every share owner for a unanimous one) over the dissolve digest.
 */
export function verifyDissolution (ctx: DissolutionContext, signedHex: string): DissolutionVerdict {
  const findings: string[] = []
  let tx: Transaction

  try {
    tx = Transaction.fromHex(signedHex.trim())
  } catch {
    return { ok: false, findings: ['The pasted transaction cannot be parsed'] }
  }

  const payload = tx.extraPayload

  if (!(payload instanceof ExtraPayload.ProDisTx)) {
    return { ok: false, findings: ['That is not a provider dissolution transaction'] }
  }

  if (payload.proTxHash.toLowerCase() !== ctx.proTxHash.toLowerCase()) {
    findings.push('The dissolution is for a different masternode')
  }

  if (payload.actorIndex >= ctx.members.length) {
    findings.push(`The actor index ${payload.actorIndex} is outside the share table`)
  }

  if (tx.inputs.length !== 1) {
    findings.push(`A dissolution spends one input, this one has ${tx.inputs.length}`)
  } else {
    const [input] = tx.inputs
    if (input.txId.toLowerCase() !== ctx.proTxHash.toLowerCase() || input.vOut !== ctx.collateralIndex) {
      findings.push('The input does not spend this masternode’s collateral output')
    }
    if (input.scriptSig.hex() !== '') {
      findings.push('The input carries a scriptSig; a dissolution authorises through its payload signatures')
    }
  }

  const sigCount = payload.sigs.length
  if (sigCount !== 1 && sigCount !== ctx.members.length) {
    findings.push(`A dissolution carries 1 or ${ctx.members.length} signatures, this one has ${sigCount}`)
  } else {
    // Core signs hash.begin(), so the digest is the raw bytes of the displayed hash
    const digest = rawDigest(dissolveSignHash(tx, sigCount))
    payload.sigs.forEach((signature, index) => {
      const shareIndex = sigCount === 1 ? payload.actorIndex : index
      const owner = ctx.members[shareIndex]?.ownerAddress
      if (owner == null || !verifyCompact(digest, signature, toHex(addressToKeyId(owner, 'testnet')))) {
        findings.push(`Signature ${index + 1} was not made by the share ${shareIndex + 1} owner key`)
      }
    })
  }

  const collateral = ctx.members.reduce((sum, member) => sum + member.amount, 0)
  const paidOut = tx.outputs.reduce((sum, output) => sum + Number(output.satoshis), 0)
  const fee = collateral - paidOut

  if (fee < 0) findings.push(`The outputs exceed the collateral by ${-fee} duffs`)
  if (fee > MAX_DISSOLVE_FEE) findings.push(`The fee ${fee} duffs is above the consensus cap of ${MAX_DISSOLVE_FEE} duffs`)

  if (tx.outputs.length !== ctx.members.length) {
    findings.push(`A dissolution pays every share: ${ctx.members.length} outputs expected, ${tx.outputs.length} found`)
  }

  const early = ctx.registeredHeight != null && ctx.height - ctx.registeredHeight < ctx.earlyPeriodBlocks
  const feeShare = Math.max(0, fee)
  ctx.members.forEach((member, index) => {
    // The actor takes the remainder, so the fee comes out of their refund on top of any penalty
    const minimum = index === payload.actorIndex && early
      ? member.amount - ctx.earlyPenalty - feeShare
      : member.amount
    const script = toHex(addressToScript(member.refundAddress, 'testnet'))
    const paid = tx.outputs
      .filter(output => output.script.hex() === script)
      .reduce((sum, output) => sum + Number(output.satoshis), 0)

    if (paid < minimum) {
      findings.push(`Share ${index + 1} is refunded ${paid === 0 ? 'nothing' : `${paid} duffs`}, at least ${minimum} expected`)
    }
  })

  return { ok: findings.length === 0, findings: [...new Set(findings)] }
}