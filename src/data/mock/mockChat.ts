import { ENVELOPE_BYTES, fromHex, open, randomBytes, seal, toHex } from '../../lib/chatCipher'
import type { EncryptionKey } from '../../lib/types'
import type { ChatCrypto } from '../types'
import { mockHash } from './mockHash'

/*
 * Stand-in for the identity-key steps of the private chat. Live, wrapping is ECIES (ECDH between a
 * throwaway key and the member's public key) and unwrapping happens inside Dash Platform Extension's
 * `decrypt` method. Here the "shared secret" is derived from public data, so this protects nothing:
 * it only gives envelopes the real shape and makes the flow work in the preview.
 */

export const MOCK_ENCRYPTION_KEY_ID = 2

/** The mock encryption key of an identity */
export function mockEncryptionKey (identity: string): EncryptionKey {
  return { id: MOCK_ENCRYPTION_KEY_ID, publicKey: '02' + mockHash(`encryption-key:${identity}`, 32) }
}

async function mockSharedSecret (publicKey: Uint8Array, ephemeral: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(publicKey.length + ephemeral.length)
  input.set(publicKey)
  input.set(ephemeral, publicKey.length)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input as BufferSource))
}

export const mockChatCrypto: ChatCrypto = {
  async wrapGroupKey (groupKey, recipients) {
    const out = new Uint8Array(recipients.length * ENVELOPE_BYTES)
    for (const [i, recipient] of recipients.entries()) {
      const ephemeral = new Uint8Array(33)
      ephemeral[0] = 3
      ephemeral.set(randomBytes(32), 1)
      const sealed = await seal(await mockSharedSecret(fromHex(recipient.publicKey), ephemeral), groupKey)
      const slot = out.subarray(i * ENVELOPE_BYTES, (i + 1) * ENVELOPE_BYTES)
      slot[0] = recipient.shareIndex
      slot.set(ephemeral, 1)
      slot.set(sealed, 34)
    }
    return toHex(out)
  },

  async unwrapGroupKey (identity, keyId, envelope) {
    const key = mockEncryptionKey(identity)
    if (key.id !== keyId || envelope.length !== ENVELOPE_BYTES) return null
    return await open(await mockSharedSecret(fromHex(key.publicKey), envelope.slice(1, 34)), envelope.slice(34))
  }
}
