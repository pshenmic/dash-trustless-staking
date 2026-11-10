import { sha256 } from '@noble/hashes/sha256'
import { base58 } from '@scure/base'
import type { Network } from './types'

/*
 * Dash addresses <-> the raw bytes the data contract stores (scriptPubKey, or the 20-byte key ID).
 * Only P2PKH and P2SH exist here: those are the only payout scripts a shared masternode accepts.
 */

const VERSIONS: Record<Network, { p2pkh: number, p2sh: number }> = {
  mainnet: { p2pkh: 76, p2sh: 16 },
  testnet: { p2pkh: 140, p2sh: 19 }
}

export type AddressType = 'p2pkh' | 'p2sh'

export interface DecodedAddress {
  type: AddressType
  /** hash160 of the public key or script */
  hash: Uint8Array
}

function checksum (payload: Uint8Array): Uint8Array {
  return sha256(sha256(payload)).slice(0, 4)
}

/** Decodes and checks an address for the network. null if the checksum, length or version is wrong. */
export function decodeAddress (address: string, network: Network): DecodedAddress | null {
  let bytes: Uint8Array
  try {
    bytes = base58.decode(address.trim())
  } catch {
    return null
  }
  if (bytes.length !== 25) return null
  const payload = bytes.slice(0, 21)
  if (!checksum(payload).every((b, i) => b === bytes[21 + i])) return null
  const version = payload[0]
  const type = version === VERSIONS[network].p2pkh ? 'p2pkh' : version === VERSIONS[network].p2sh ? 'p2sh' : null
  return type == null ? null : { type, hash: payload.slice(1) }
}

export function encodeAddress (hash: Uint8Array, type: AddressType, network: Network): string {
  const payload = new Uint8Array(21)
  payload[0] = VERSIONS[network][type]
  payload.set(hash, 1)
  const out = new Uint8Array(25)
  out.set(payload)
  out.set(checksum(payload), 21)
  return base58.encode(out)
}

/** scriptPubKey paying an address: P2PKH (25 bytes) or P2SH (23 bytes) */
export function addressToScript (address: string, network: Network): Uint8Array {
  const decoded = decodeAddress(address, network)
  if (decoded == null) throw new Error(`Not a valid ${network} address: ${address}`)
  return decoded.type === 'p2pkh'
    ? Uint8Array.from([0x76, 0xa9, 0x14, ...decoded.hash, 0x88, 0xac])
    : Uint8Array.from([0xa9, 0x14, ...decoded.hash, 0x87])
}

/** The address a P2PKH or P2SH scriptPubKey pays. null for any other script. */
export function scriptToAddress (script: Uint8Array, network: Network): string | null {
  if (script.length === 25 && script[0] === 0x76 && script[1] === 0xa9 && script[2] === 0x14 && script[23] === 0x88 && script[24] === 0xac) {
    return encodeAddress(script.slice(3, 23), 'p2pkh', network)
  }
  if (script.length === 23 && script[0] === 0xa9 && script[1] === 0x14 && script[22] === 0x87) {
    return encodeAddress(script.slice(2, 22), 'p2sh', network)
  }
  return null
}

/** The 20-byte key ID behind a P2PKH address */
export function addressToKeyId (address: string, network: Network): Uint8Array {
  const decoded = decodeAddress(address, network)
  if (decoded?.type !== 'p2pkh') throw new Error(`Not a valid ${network} P2PKH address: ${address}`)
  return decoded.hash
}

export function keyIdToAddress (keyId: Uint8Array, network: Network): string {
  return encodeAddress(keyId, 'p2pkh', network)
}
