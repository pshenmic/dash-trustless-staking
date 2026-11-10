import { secp256k1 } from '@noble/curves/secp256k1.js'
import { ripemd160 } from '@noble/hashes/ripemd160'
import { sha256 } from '@noble/hashes/sha256'
import type { PrivateKey } from 'dash-core-sdk'
import { fromHex, toHex } from './bytes.js'

const COMPACT_SIGNATURE_SIZE = 65
const HEADER_BASE = 27
const HEADER_COMPRESSED_OFFSET = 4
const HALF_CURVE_ORDER = secp256k1.Point.CURVE().n >> 1n

/**
 * Signs a 32-byte hash the way Dash Core's CPubKey::CompactSign does: 65 bytes of
 * header || r || s, where the header encodes the recovery id and the key compression.
 */
export function signCompact (hash: string, privateKey: PrivateKey): string {
  const recovered = secp256k1.sign(fromHex(hash), privateKey.key, {
    prehash: false,
    lowS: true,
    format: 'recovered'
  })

  const signature = new Uint8Array(COMPACT_SIGNATURE_SIZE)
  // @noble/curves emits the recovery byte first, then r and s; Core expects it in the header
  signature[0] = HEADER_BASE + recovered[0] + (privateKey.compressed ? HEADER_COMPRESSED_OFFSET : 0)
  signature.set(recovered.slice(1), 1)

  return toHex(signature)
}

/**
 * Recovers the signing key from a compact signature, the way Core's CPubKey::RecoverCompact does.
 * Rejects non-canonical (high-S) signatures, which Core also refuses.
 */
function recoverCompact (hash: string, signature: string): Uint8Array {
  const bytes = fromHex(signature)

  if (bytes.byteLength !== COMPACT_SIGNATURE_SIZE) {
    throw new Error(`Incorrect compact signature length: ${bytes.byteLength}`)
  }

  const header = bytes[0]

  if (header < HEADER_BASE || header > HEADER_BASE + HEADER_COMPRESSED_OFFSET + 3) {
    throw new Error(`Incorrect compact signature header: ${header}`)
  }

  const compressed = header >= HEADER_BASE + HEADER_COMPRESSED_OFFSET
  const recovery = (header - HEADER_BASE) & 3
  const s = BigInt('0x' + signature.slice(66, 130))

  if (s > HALF_CURVE_ORDER) {
    throw new Error('Non-canonical compact signature: s is not in the lower half of the curve order')
  }

  const recovered = new Uint8Array(COMPACT_SIGNATURE_SIZE)
  recovered[0] = recovery
  recovered.set(bytes.slice(1), 1)

  const point = secp256k1.Point.fromBytes(secp256k1.recoverPublicKey(recovered, fromHex(hash), { prehash: false }))

  return point.toBytes(compressed)
}

/** True when the signature recovers to the key whose hash160 is `keyId`. Never throws. */
export function verifyCompact (hash: string, signature: string, keyId: string): boolean {
  try {
    return toHex(ripemd160(sha256(recoverCompact(hash, signature)))) === keyId.toLowerCase()
  } catch {
    return false
  }
}