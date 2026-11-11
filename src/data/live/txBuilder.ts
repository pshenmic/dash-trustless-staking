import {
  buildRegistration as buildLibRegistration,
  combine as combineLib,
  extractFeeScriptSigs as extractFeeLib,
  extractScriptSigs as extractLib,
  verifyConsent as verifyConsentLib,
  verifyFeeScriptSigs as verifyFeeScriptSigsLib,
  verifyScriptSigs as verifyScriptSigsLib,
  withJoinSignatures as withJoinSignaturesLib,
  type RegistrationTx as LibRegistration
} from '../../lib/registration'
import { memberFeeShares } from '../../lib/rules'
import type { Duffs, Join, Outpoint, Pool, Prevout } from '../../lib/types'
import { verifyDissolution as verifyDissolutionLib } from '../../lib/dissolution'
import type { RegistrationTx, TxBuilder } from '../types'

/**
 * TxBuilder over the pure builder in src/lib/registration.ts. `buildRegistration` keeps the built
 * transaction keyed by its unsigned hex, which every other method receives back from the port.
 */
export function createLiveTxBuilder (): TxBuilder {
  const built = new Map<string, LibRegistration>()
  const joinsOf = (tx: RegistrationTx): Join[] => tx.members.map(m => m.join)

  return {
    buildRegistration (pool: Pool, members: Join[], inputValues: Map<string, Duffs | null>, feeInputs: Outpoint[] = [], feeChangeAddress?: string): RegistrationTx {
      const registration = buildLibRegistration(pool, members, inputValues, feeInputs, feeChangeAddress)
      built.set(registration.unsignedHex, registration)
      const shares = memberFeeShares(pool.fee ?? 0, members.length, pool.feePayer)

      return {
        unsignedHex: registration.unsignedHex,
        consentHash: registration.consentHash,
        collateralIndex: registration.collateralIndex,
        problems: registration.problems,
        feeInputs,
        ...(feeChangeAddress != null && feeChangeAddress !== '' ? { feeChangeAddress } : {}),
        members: members.map((join, index) => {
          let total: Duffs | null = 0
          for (const input of join.inputs) {
            const value = inputValues.get(`${input.txid}:${input.vout}`)
            if (value == null) { total = null; break }
            total += Number(value)
          }
          return {
            join,
            feeShare: shares[index],
            inputTotal: total,
            change: total == null ? null : total - join.amount - shares[index]
          }
        })
      }
    },

    verifyConsent (tx, shareIndex, signatureBase64) {
      const registration = built.get(tx.unsignedHex)
      return registration != null && verifyConsentLib(registration, joinsOf(tx), shareIndex, signatureBase64)
    },

    withJoinSignatures (tx, signatures) {
      const registration = built.get(tx.unsignedHex)
      return registration == null ? tx.unsignedHex : withJoinSignaturesLib(registration, signatures)
    },

    verifyScriptSigs (tx, shareIndex, scriptSigs, prevouts: Map<string, Prevout | null>, joinedHex) {
      return verifyScriptSigsLib(joinedHex, joinsOf(tx), shareIndex, scriptSigs, prevouts)
    },

    extractScriptSigs (tx, shareIndex, signedHex, joinedHex) {
      return extractLib(joinedHex, joinsOf(tx), shareIndex, signedHex)
    },

    verifyFeeScriptSigs (tx, scriptSigs, prevouts, joinedHex) {
      return verifyFeeScriptSigsLib(joinedHex, joinsOf(tx), tx.feeInputs, scriptSigs, prevouts)
    },

    extractFeeScriptSigs (tx, signedHex, joinedHex) {
      return extractFeeLib(joinedHex, joinsOf(tx), tx.feeInputs, signedHex)
    },

    combine (tx, signatures, scriptSigs, feeScriptSigs = []) {
      const registration = built.get(tx.unsignedHex)
      if (registration == null) return { hex: tx.unsignedHex, txid: '' }
      return combineLib(registration, signatures, scriptSigs, feeScriptSigs)
    },

    verifyDissolution: verifyDissolutionLib
  }
}