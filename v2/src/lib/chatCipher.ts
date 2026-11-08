/*
 * Private chat cryptography that needs no identity key (DESIGN.md "Private chat").
 *
 * A pool's private chat has one random 256-bit group key. Messages are AES-256-GCM under it:
 *   payload = nonce (12 bytes) || ciphertext || tag (16 bytes)
 * Each selected member gets the group key in an envelope only their identity key opens. Envelopes
 * are fixed-size slots, concatenated in the chatKey document:
 *   slot = shareIndex (1) || ephemeral public key (33) || nonce (12) || wrapped key (32) || tag (16)
 */

import { fromHex, toHex } from './bytes'

export { fromHex, toHex }

export const GROUP_KEY_BYTES = 32
export const ENVELOPE_BYTES = 1 + 33 + 12 + 32 + 16
const NONCE_BYTES = 12

export function randomBytes (length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

export function generateGroupKey (): Uint8Array {
  return randomBytes(GROUP_KEY_BYTES)
}

async function aesKey (raw: Uint8Array): Promise<CryptoKey> {
  return await crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** AES-256-GCM: returns nonce || ciphertext || tag */
export async function seal (key: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const nonce = randomBytes(NONCE_BYTES)
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, await aesKey(key), plaintext as BufferSource))
  const out = new Uint8Array(NONCE_BYTES + sealed.length)
  out.set(nonce)
  out.set(sealed, NONCE_BYTES)
  return out
}

/** Reverse of seal. Returns null when the key is wrong or the data was altered. */
export async function open (key: Uint8Array, payload: Uint8Array): Promise<Uint8Array | null> {
  if (payload.length < NONCE_BYTES + 16) return null
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: payload.slice(0, NONCE_BYTES) as BufferSource }, await aesKey(key), payload.slice(NONCE_BYTES) as BufferSource
    )
    return new Uint8Array(plain)
  } catch {
    return null
  }
}

export async function encryptMessage (groupKey: Uint8Array, text: string): Promise<string> {
  return toHex(await seal(groupKey, new TextEncoder().encode(text)))
}

export async function decryptMessage (groupKey: Uint8Array, payloadHex: string): Promise<string | null> {
  const plain = await open(groupKey, fromHex(payloadHex))
  return plain == null ? null : new TextDecoder().decode(plain)
}

/** Splits a chatKey document's envelopes into slots by share index. null if malformed. */
export function parseEnvelopes (envelopesHex: string): Map<number, Uint8Array> | null {
  if (!/^([0-9a-f]{2})+$/i.test(envelopesHex)) return null
  const bytes = fromHex(envelopesHex)
  if (bytes.length === 0 || bytes.length % ENVELOPE_BYTES !== 0) return null
  const slots = new Map<number, Uint8Array>()
  for (let offset = 0; offset < bytes.length; offset += ENVELOPE_BYTES) {
    const slot = bytes.slice(offset, offset + ENVELOPE_BYTES)
    if (slots.has(slot[0])) return null
    slots.set(slot[0], slot)
  }
  return slots
}
