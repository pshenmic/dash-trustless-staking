import { bls12_381 } from '@noble/curves/bls12-381.js'
import { fromHex } from './bytes.js'

const G1 = bls12_381.G1.Point

/**
 * True when the 48-byte key decodes as a BLS12-381 G1 point in either Dash encoding.
 *
 * Basic sets 0x80 (compressed) and keeps the y sign in 0x20; legacy drops the compression flag and
 * carries the sign in 0x80. Both are 48 bytes and a masternode list prints them verbatim, so the
 * check has to try both. All 400 non-empty testnet operator keys decode, and flipping one byte of a
 * real key fails — so this rejects typos without rejecting a real encoding.
 */
export function isOperatorKeyPoint (hex: string): boolean {
  if (!/^[0-9a-fA-F]{96}$/.test(hex) || /^0+$/.test(hex)) return false

  const bytes = fromHex(hex)
  try {
    G1.fromBytes(bytes)
    return true
  } catch {
    // Legacy encoding below
  }

  const legacy = Uint8Array.from(bytes)
  const negative = (legacy[0] & 0x80) !== 0
  legacy[0] = (legacy[0] & 0x1f) | 0x80 | (negative ? 0x20 : 0)
  try {
    G1.fromBytes(legacy)
    return true
  } catch {
    return false
  }
}