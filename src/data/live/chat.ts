import { secp256k1 } from '@noble/curves/secp256k1.js'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { PrivateKeyWASM } from 'pshenmic-dpp'
import { ENVELOPE_BYTES, fromHex, open, randomBytes, seal, toHex } from '../../lib/chatCipher'
import { currentSession, type AuthSession } from '../../wallet/authSession'
import type { ChatCrypto } from '../types'

const GROUP_KEY_BYTES = 32
const EPHEMERAL_PUBLIC_KEY_BYTES = 33
const KDF_INFO = new TextEncoder().encode('dash-trustless-staking/private-chat/v1')

function deriveKey (shared: Uint8Array): Uint8Array {
  return hkdf(sha256, shared, undefined, KDF_INFO, GROUP_KEY_BYTES)
}

function isCompressedPublicKey (bytes: Uint8Array): boolean {
  return bytes.length === EPHEMERAL_PUBLIC_KEY_BYTES && (bytes[0] === 2 || bytes[0] === 3)
}

/**
 * Live ECIES for the private chat (DESIGN.md "Private chat"). Wrapping needs only the recipient's
 * encryption public key. Unwrapping uses the encryption private key from the private-key login session.
 */
export function createLiveChatCrypto (getSession: () => AuthSession | null = currentSession): ChatCrypto {
  return {
    async wrapGroupKey (groupKey, recipients) {
      const slots = await Promise.all(recipients.map(async recipient => {
        const recipientPublicKey = fromHex(recipient.publicKey)
        if (!isCompressedPublicKey(recipientPublicKey)) {
          throw new Error(`Recipient ${recipient.shareIndex} has an invalid encryption public key`)
        }
        const ephemeralSecret = randomBytes(32)
        const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralSecret, true)
        const shared = secp256k1.getSharedSecret(ephemeralSecret, recipientPublicKey, true)
        return { shareIndex: recipient.shareIndex, ephemeralPublicKey, sealed: await seal(deriveKey(shared), groupKey) }
      }))

      const out = new Uint8Array(slots.length * ENVELOPE_BYTES)
      slots.forEach((slot, index) => {
        const offset = index * ENVELOPE_BYTES
        out[offset] = slot.shareIndex
        out.set(slot.ephemeralPublicKey, offset + 1)
        out.set(slot.sealed, offset + 1 + EPHEMERAL_PUBLIC_KEY_BYTES)
      })
      return toHex(out)
    },

    async unwrapGroupKey (identity, keyId, envelope) {
      const session = getSession()
      if (
        session?.mode !== 'privateKey' ||
        session.identityId !== identity ||
        session.encryptionKeyId !== keyId ||
        envelope.length !== ENVELOPE_BYTES
      ) return null

      try {
        const privateKey = PrivateKeyWASM.fromWIF(session.encryptionKeyWif).bytes()
        const ephemeralPublicKey = envelope.slice(1, 1 + EPHEMERAL_PUBLIC_KEY_BYTES)
        if (!isCompressedPublicKey(ephemeralPublicKey)) return null
        const shared = secp256k1.getSharedSecret(privateKey, ephemeralPublicKey, true)
        const groupKey = await open(deriveKey(shared), envelope.slice(1 + EPHEMERAL_PUBLIC_KEY_BYTES))
        return groupKey != null && groupKey.length === GROUP_KEY_BYTES ? groupKey : null
      } catch {
        return null
      }
    }
  }
}