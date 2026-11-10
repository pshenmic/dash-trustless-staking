import {
  buildRegistration as buildLibRegistration,
  combine as combineLib,
  extractScriptSigs as extractLib,
  verifyConsent as verifyConsentLib,
  verifyScriptSigs as verifyScriptSigsLib,
  withJoinSignatures as withJoinSignaturesLib,
  type RegistrationTx as LibRegistration
} from '../../lib/registration'
import type { Duffs, Join, Pool, Prevout } from '../../lib/types'
import { verifyDissolution as verifyDissolutionLib } from '../../lib/dissolution'
import type { RegistrationTx, TxBuilder } from '../types'

function feeShares (fee: Duffs, count: number): Duffs[] {
  const per = Math.floor(fee / count)
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? fee - per * (count - 1) : per))
}

/**
 * TxBuilder over the pure builder in src/lib/registration.ts. `buildRegistration` keeps the built
 * transaction keyed by its unsigned hex, which every other method receives back from the port.
 */
export function createLiveTxBuilder (): TxBuilder {
  const built = new Map<string, LibRegistration>()
  const joinsOf = (tx: RegistrationTx): Join[] => tx.members.map(m => m.join)

  return {
    buildRegistration (pool: Pool, members: Join[], inputValues: Map<string, Duffs | null>): RegistrationTx {
      const registration = buildLibRegistration(pool, members, inputValues)
      built.set(registration.unsignedHex, registration)
      const shares = feeShares(pool.fee ?? 0, members.length)

      return {
        unsignedHex: registration.unsignedHex,
        consentHash: registration.consentHash,
        collateralIndex: registration.collateralIndex,
        problems: registration.problems,
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

    combine (tx, signatures, scriptSigs) {
      const registration = built.get(tx.unsignedHex)
      if (registration == null) return { hex: tx.unsignedHex, txid: '' }
      return combineLib(registration, signatures, scriptSigs)
    },

    verifyDissolution: verifyDissolutionLib
  }
}