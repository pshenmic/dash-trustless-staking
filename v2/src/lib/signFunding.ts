import { Network as CoreNetwork, PrivateKey, Script, Transaction } from 'dash-core-sdk'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha256'
import { ripemd160 } from '@noble/hashes/ripemd160'
import { scriptToAddress } from './address.js'
import { fromHex, toHex } from './bytes.js'
import { legacySighash } from './registration.js'
import type { Join, Prevout } from './types.js'

export type SignFundingResult =
  | { ok: true, hex: string, signedInputs: number }
  | { ok: false, error: string }

function hash160 (bytes: Uint8Array): string {
  return toHex(ripemd160(sha256(bytes)))
}

function parseKey (text: string): PrivateKey | null {
  try {
    const trimmed = text.trim()
    return /^[0-9a-fA-F]{64}$/.test(trimmed)
      ? new PrivateKey(fromHex(trimmed), CoreNetwork.Testnet, true)
      : PrivateKey.fromWIF(trimmed)
  } catch {
    return null
  }
}

/** P2PKH scriptSig: push(DER signature || SIGHASH_ALL) push(compressed pubkey) */
function p2pkhScriptSig (signatureDer: Uint8Array, publicKey: Uint8Array): string {
  if (signatureDer.byteLength > 75 || publicKey.byteLength > 75) throw new Error('Push too large for a P2PKH scriptSig')

  return [
    signatureDer.byteLength.toString(16).padStart(2, '0'),
    toHex(signatureDer),
    publicKey.byteLength.toString(16).padStart(2, '0'),
    toHex(publicKey)
  ].join('')
}

/**
 * Signs this member's funding inputs with one or more private keys (WIF or hex, separated by commas,
 * spaces or newlines) and returns the partially signed transaction. Every input of the member must
 * be covered: the pool needs the whole set, so a partial result is reported as an error.
 */
export function signFundingWithKeys (joinedHex: string, members: Join[], shareIndex: number, keyTexts: string[], prevouts: Map<string, Prevout | null>): SignFundingResult {
  const member = members[shareIndex]
  if (member == null) return { ok: false, error: 'This identity is not a member of the pool' }

  const keys = keyTexts.flatMap(text => text.split(/[\s,]+/)).filter(text => text !== '').map(parseKey)
  if (keys.length === 0) return { ok: false, error: 'Paste at least one private key' }
  if (keys.some(key => key == null)) return { ok: false, error: 'One of the pasted keys is not a valid WIF or 64-character hex key' }

  try {
    const tx = Transaction.fromHex(joinedHex)
    const offset = members.slice(0, shareIndex).reduce((sum, join) => sum + join.inputs.length, 0)
    const missing: string[] = []

    for (let k = 0; k < member.inputs.length; k++) {
      const prevout = prevouts.get(`${member.inputs[k].txid}:${member.inputs[k].vout}`)
      if (prevout == null) return { ok: false, error: `Could not read the funding transaction for input ${k + 1}` }
      if (!/^76a914[a-fA-F0-9]{40}88ac$/.test(prevout.script)) {
        return { ok: false, error: 'One of your inputs is not P2PKH, so it cannot be signed here' }
      }

      const key = keys.find(candidate => candidate != null && hash160(candidate.getPublicKey().bytes()) === prevout.script.slice(6, 46))
      if (key == null) {
        missing.push(scriptToAddress(fromHex(prevout.script), 'testnet') ?? prevout.script)
        continue
      }

      const digest = legacySighash(tx, offset + k, prevout.script)
      const compact = secp256k1.sign(digest, key.key, { prehash: false, lowS: true })
      const der = secp256k1.Signature.fromBytes(compact, 'compact').toBytes('der')
      const withHashtype = new Uint8Array(der.byteLength + 1)
      withHashtype.set(der)
      withHashtype[der.byteLength] = 1 // SIGHASH_ALL
      tx.inputs[offset + k].scriptSig = Script.fromHex(p2pkhScriptSig(withHashtype, key.getPublicKey().bytes()))
    }

    if (missing.length > 0) {
      return { ok: false, error: `Add the private key for ${[...new Set(missing)].join(', ')} — every input you committed has to be signed` }
    }

    return { ok: true, hex: tx.hex(), signedInputs: member.inputs.length }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not sign the funding inputs' }
  }
}