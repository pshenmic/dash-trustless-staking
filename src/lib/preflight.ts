import { Transaction } from 'dash-core-sdk'
import { COLLATERAL, SHARED_COLLATERAL_SCRIPT } from './consensus.js'
import type { Duffs, Join, Outpoint } from './types.js'

export interface CombinedTx {
  collateralIndex: number
  hex: string
}

/**
 * Everything that must hold before the registration is broadcast: every committed input present and
 * signed, the collateral output exact, and the outputs covered by the inputs. Returns human-readable
 * problems; empty means the transaction is ready.
 */
export function finalTxProblems (combined: CombinedTx, members: Join[], inputValues: Map<string, Duffs | null>, feeInputs: Outpoint[] = [], fee: Duffs = 0): string[] {
  const problems: string[] = []
  let tx: Transaction

  try {
    tx = Transaction.fromHex(combined.hex)
  } catch {
    return ['The combined transaction cannot be parsed']
  }

  const expectedInputs = members.reduce((count, member) => count + member.inputs.length, 0) + feeInputs.length
  if (tx.inputs.length !== expectedInputs) {
    problems.push(`The transaction has ${tx.inputs.length} inputs but the pool committed ${expectedInputs}`)
  }

  tx.inputs.forEach((input, index) => {
    if (input.scriptSig.hex() === '') problems.push(`Input ${index + 1} has no signature`)
  })

  // Core verifies one 65-byte compact signature per share and rejects the whole tx otherwise
  const joinSigs = (tx.extraPayload as unknown as { joinSigs?: string[] } | undefined)?.joinSigs
  if (joinSigs == null) {
    problems.push('The transaction has no share signatures')
  } else {
    if (joinSigs.length !== members.length) problems.push(`The transaction has ${joinSigs.length} share signatures for ${members.length} members`)
    joinSigs.forEach((signature, index) => {
      if (!/^[0-9a-f]{130}$/.test(signature) || /^0+$/.test(signature)) {
        problems.push(`Share signature ${index + 1} is not a 65-byte hex signature`)
      }
    })
  }

  let totalIn = 0
  for (const outpoint of [...members.flatMap(member => member.inputs), ...feeInputs]) {
    const value = inputValues.get(`${outpoint.txid}:${outpoint.vout}`)
    if (value == null) problems.push(`Missing value for input ${outpoint.txid.slice(0, 8)}…:${outpoint.vout}`)
    else totalIn += Number(value)
  }

  const collateral = tx.outputs[combined.collateralIndex]
  if (collateral == null) {
    problems.push('The collateral output is missing')
  } else {
    if (collateral.script.hex() !== SHARED_COLLATERAL_SCRIPT) problems.push('The collateral output does not pay the shared collateral script')
    if (Number(collateral.satoshis) !== COLLATERAL) problems.push(`The collateral output is ${Number(collateral.satoshis)} duffs, expected ${COLLATERAL}`)
  }

  const totalOut = tx.outputs.reduce((sum, output) => sum + Number(output.satoshis), 0)
  if (totalIn < totalOut) problems.push(`The outputs exceed the inputs by ${totalOut - totalIn} duffs`)
  else if (totalIn - totalOut < fee) problems.push(`The transaction pays ${totalIn - totalOut} duffs in fees, less than the pool's ${fee}`)

  return [...new Set(problems)]
}