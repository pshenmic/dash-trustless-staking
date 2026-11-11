import { memberFeeShares } from '../../lib/rules'
import { formatDash } from '../../lib/format'
import type { Duffs, Join, Outpoint, Pool } from '../../lib/types'
import { outpointKey, type RegistrationMember, type RegistrationTx, type TxBuilder } from '../types'
import { mockHash, mockTxHex } from './mockHash'

/*
 * Stand-in for the dash-core-sdk transaction builder. The money math (fee split, change) is real;
 * the transaction bytes, hashes and signature checks are fakes with the right shape.
 * Signature checks only validate the format until dash-core-sdk can recover keys.
 */

export function mockConsentHash (pool: Pool, members: Join[]): string {
  return mockHash(`consent:${pool.id}:${members.map(m => m.id).join(',')}`)
}

export function mockProTxHash (consentHash: string): string {
  return mockHash(`protx:${consentHash}`)
}

/**
 * Prefixes that mark mock final transactions: version 3, type 1 (ProRegTx) or 10 (ProDisTx),
 * followed by the proTxHash, so the mock chain knows what a broadcast does
 */
export const MOCK_REGISTRATION_PREFIX = '0300' + '0100'
export const MOCK_DISSOLVE_PREFIX = '0300' + '0a00'

export function mockDissolutionHex (proTxHash: string, actorIndex: number): string {
  return MOCK_DISSOLVE_PREFIX + proTxHash + mockHash(`dissolve:${proTxHash}:${actorIndex}`, 120)
}

export function mockScriptSigs (seed: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => '47' + mockHash(`${seed}:${i}`, 71))
}

export function mockSignedFundingHex (consentHash: string, shareIndex: number): string {
  return mockTxHex(`funding:${consentHash}:${shareIndex}`)
}

function decodeBase64 (value: string): Uint8Array | null {
  try {
    const binary = atob(value.trim())
    return Uint8Array.from(binary, c => c.charCodeAt(0))
  } catch {
    return null
  }
}

function isHex (value: string, minBytes: number): boolean {
  const v = value.trim()
  return v.length >= minBytes * 2 && v.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(v)
}

export const mockTxBuilder: TxBuilder = {
  buildRegistration (pool: Pool, members: Join[], inputValues: Map<string, Duffs | null>, feeInputs: Outpoint[] = [], feeChangeAddress?: string): RegistrationTx {
    const fees = memberFeeShares(pool.fee, members.length, pool.feePayer)
    const problems: string[] = []
    const regMembers: RegistrationMember[] = members.map((join, i) => {
      const values = join.inputs.map(o => inputValues.get(outpointKey(o)) ?? null)
      const inputTotal = values.every(v => v != null) ? values.reduce<number>((s, v) => s + (v ?? 0), 0) : null
      const change = inputTotal == null ? null : inputTotal - join.amount - fees[i]
      if (inputTotal == null) problems.push(`Share ${i + 1}: an input was not found on chain`)
      else if (change != null && change < 0) problems.push(`Share ${i + 1}: inputs are ${formatDash(-change)} short of amount + fee`)
      return { join, feeShare: fees[i], inputTotal, change }
    })
    let feeChange = 0
    if (pool.feePayer === 'creator') {
      if (feeInputs.length === 0) problems.push('The creator fee input is missing')
      const values = feeInputs.map(o => inputValues.get(outpointKey(o)) ?? null)
      const total = values.every(v => v != null) ? values.reduce<number>((s, v) => s + (v ?? 0), 0) : null
      if (total == null) problems.push('A creator fee input was not found on chain')
      else if (total < (pool.fee ?? 0)) problems.push(`The creator fee inputs are ${formatDash(pool.fee - total)} short`)
      else if (total > (pool.fee ?? 0)) {
        feeChange = total - pool.fee
        if (feeChangeAddress == null || feeChangeAddress === '') problems.push('The creator fee inputs leave change; enter a change address')
      }
    }
    const consentHash = mockConsentHash(pool, members)
    const changeOutputs = regMembers.filter(m => (m.change ?? 0) > 0).length + (feeChange > 0 ? 1 : 0)
    return {
      unsignedHex: mockTxHex(`unsigned:${consentHash}`),
      consentHash,
      collateralIndex: changeOutputs,
      members: regMembers,
      feeInputs,
      ...(feeChangeAddress != null && feeChangeAddress !== '' ? { feeChangeAddress } : {}),
      problems
    }
  },

  verifyConsent (_tx, _shareIndex, signatureBase64) {
    const bytes = decodeBase64(signatureBase64)
    return bytes != null && bytes.length === 65 && bytes[0] >= 27 && bytes[0] <= 34 && bytes[33] <= 0x7f
  },

  withJoinSignatures (tx, signatures) {
    return mockTxHex(`joined:${tx.consentHash}:${signatures.length}`)
  },

  verifyScriptSigs (tx, shareIndex, scriptSigs, _prevouts, _joinedHex) {
    const member = tx.members[shareIndex]
    return member != null && scriptSigs.length === member.join.inputs.length && scriptSigs.every(s => isHex(s, 70))
  },

  extractScriptSigs (tx, shareIndex, signedHex, _joinedHex) {
    if (!isHex(signedHex, 60)) return null
    const member = tx.members[shareIndex]
    return member == null ? null : mockScriptSigs(`${tx.consentHash}:${shareIndex}:${signedHex.slice(0, 16)}`, member.join.inputs.length)
  },

  verifyFeeScriptSigs (tx, scriptSigs, _prevouts, _joinedHex) {
    return tx.feeInputs.length > 0 && scriptSigs.length === tx.feeInputs.length && scriptSigs.every(s => isHex(s, 70))
  },

  extractFeeScriptSigs (tx, signedHex, _joinedHex) {
    if (!isHex(signedHex, 60)) return null
    return mockScriptSigs(`${tx.consentHash}:fee:${signedHex.slice(0, 16)}`, tx.feeInputs.length)
  },

  combine (tx) {
    const txid = mockProTxHash(tx.consentHash)
    return { hex: MOCK_REGISTRATION_PREFIX + txid + mockHash(`final:${txid}`, 300), txid }
  },

  verifyDissolution (ctx, signedHex) {
    if (!isHex(signedHex, 60)) return { ok: false, findings: ['The pasted transaction cannot be parsed'] }
    if (!signedHex.trim().toLowerCase().startsWith((MOCK_DISSOLVE_PREFIX + ctx.proTxHash).toLowerCase())) {
      return { ok: false, findings: ['The dissolution is for a different masternode'] }
    }
    return { ok: true, findings: [] }
  }
}
