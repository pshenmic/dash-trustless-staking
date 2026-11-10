import { describe, expect, test } from 'vitest'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { PrivateKeyWASM } from 'pshenmic-dpp'
import { ENVELOPE_BYTES, fromHex, parseEnvelopes, toHex } from '../../lib/chatCipher'
import type { AuthSession } from '../../wallet/authSession'
import { createLiveChatCrypto } from './chat'

const encryptionKey = PrivateKeyWASM.fromHex('04'.repeat(32), 'testnet')
const otherEncryptionKey = PrivateKeyWASM.fromHex('05'.repeat(32), 'testnet')
const encryptionPublicKey = toHex(secp256k1.getPublicKey(encryptionKey.bytes(), true))
const otherPublicKey = toHex(secp256k1.getPublicKey(otherEncryptionKey.bytes(), true))

const groupKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1)

function sessionFor (key: PrivateKeyWASM, keyId = 7, identityId = 'identity-id'): AuthSession {
  return {
    mode: 'privateKey',
    identityId,
    authKeyId: 0,
    authKeyWif: 'unused',
    encryptionKeyId: keyId,
    encryptionKeyWif: key.WIF()
  }
}

describe('createLiveChatCrypto', () => {
  test('wraps with the recipient public key and unwraps with the session encryption key', async () => {
    const chat = createLiveChatCrypto(() => sessionFor(encryptionKey))
    const envelopes = await chat.wrapGroupKey(groupKey, [{ shareIndex: 3, publicKey: encryptionPublicKey }])
    const slots = parseEnvelopes(envelopes)

    expect(slots?.size).toBe(1)
    const slot = slots?.get(3)
    expect(slot?.length).toBe(ENVELOPE_BYTES)
    expect(slot?.[0]).toBe(3)
    expect([2, 3]).toContain(slot?.[1])

    const opened = await chat.unwrapGroupKey('identity-id', 7, slot as Uint8Array)
    expect(opened == null ? null : toHex(opened)).toBe(toHex(groupKey))
  })

  test('writes one slot per recipient in the given order', async () => {
    const chat = createLiveChatCrypto(() => sessionFor(encryptionKey))
    const envelopes = await chat.wrapGroupKey(groupKey, [
      { shareIndex: 1, publicKey: otherPublicKey },
      { shareIndex: 2, publicKey: encryptionPublicKey }
    ])
    const slots = parseEnvelopes(envelopes)

    expect([...slots?.keys() ?? []].sort()).toEqual([1, 2])
    expect(slots?.get(1)?.slice(1, 34)).not.toEqual(slots?.get(2)?.slice(1, 34))
  })

  test('returns null for a different identity', async () => {
    const chat = createLiveChatCrypto(() => sessionFor(encryptionKey))
    const envelopes = await chat.wrapGroupKey(groupKey, [{ shareIndex: 3, publicKey: encryptionPublicKey }])
    const slot = parseEnvelopes(envelopes)?.get(3) as Uint8Array
    await expect(chat.unwrapGroupKey('another-identity', 7, slot)).resolves.toBeNull()
  })

  test('returns null for a different key id', async () => {
    const chat = createLiveChatCrypto(() => sessionFor(encryptionKey))
    const envelopes = await chat.wrapGroupKey(groupKey, [{ shareIndex: 3, publicKey: encryptionPublicKey }])
    const slot = parseEnvelopes(envelopes)?.get(3) as Uint8Array
    await expect(chat.unwrapGroupKey('identity-id', 8, slot)).resolves.toBeNull()
  })

  test('returns null with no session', async () => {
    const chat = createLiveChatCrypto(() => null)
    const envelopes = await chat.wrapGroupKey(groupKey, [{ shareIndex: 3, publicKey: encryptionPublicKey }])
    const slot = parseEnvelopes(envelopes)?.get(3) as Uint8Array
    await expect(chat.unwrapGroupKey('identity-id', 7, slot)).resolves.toBeNull()
  })

  test('returns null for a different private key', async () => {
    const chat = createLiveChatCrypto(() => sessionFor(otherEncryptionKey))
    const envelopes = await chat.wrapGroupKey(groupKey, [{ shareIndex: 3, publicKey: encryptionPublicKey }])
    const slot = parseEnvelopes(envelopes)?.get(3) as Uint8Array
    await expect(chat.unwrapGroupKey('identity-id', 7, slot)).resolves.toBeNull()
  })

  test('returns null when the tag or ciphertext is altered', async () => {
    const chat = createLiveChatCrypto(() => sessionFor(encryptionKey))
    const envelopes = await chat.wrapGroupKey(groupKey, [{ shareIndex: 3, publicKey: encryptionPublicKey }])
    const slot = parseEnvelopes(envelopes)?.get(3) as Uint8Array

    const tamperedTag = Uint8Array.from(slot)
    tamperedTag[tamperedTag.length - 1] ^= 1
    await expect(chat.unwrapGroupKey('identity-id', 7, tamperedTag)).resolves.toBeNull()

    const tamperedKey = Uint8Array.from(slot)
    tamperedKey[40] ^= 1
    await expect(chat.unwrapGroupKey('identity-id', 7, tamperedKey)).resolves.toBeNull()
  })

  test('returns null for a malformed envelope', async () => {
    const chat = createLiveChatCrypto(() => sessionFor(encryptionKey))
    await expect(chat.unwrapGroupKey('identity-id', 7, new Uint8Array(ENVELOPE_BYTES - 1))).resolves.toBeNull()
  })

  test('rejects a recipient public key that is not compressed secp256k1', async () => {
    const chat = createLiveChatCrypto(() => sessionFor(encryptionKey))
    await expect(chat.wrapGroupKey(groupKey, [{ shareIndex: 3, publicKey: '04' + '00'.repeat(32) }])).rejects.toThrow(/invalid encryption public key/)
  })

  test('round-trips through the envelope parser', async () => {
    const chat = createLiveChatCrypto(() => sessionFor(encryptionKey))
    const envelopes = await chat.wrapGroupKey(groupKey, [{ shareIndex: 3, publicKey: encryptionPublicKey }])
    const slot = parseEnvelopes(envelopes)?.get(3) as Uint8Array
    expect(fromHex(toHex(slot))).toEqual(slot)
  })
})