import { describe, expect, test } from 'vitest'
import { Network, PrivateKey, verifyCompact } from 'dash-core-sdk'
import { randomBytes } from 'node:crypto'
import { fromHex, toHex } from './bytes'
import { keyIdToAddress } from './address'
import { rawDigest } from './registration'
import { signConsentWithKey } from './signConsent'

const HASH = '0123456789abcdef'.repeat(4)

function makeKey (): PrivateKey {
  return new PrivateKey(randomBytes(32), Network.Testnet, true)
}

describe('signConsentWithKey', () => {
  test('signs the raw digest the way Core does, not the displayed hash', () => {
    const key = makeKey()
    const owner = key.getPublicKey().getAddress(Network.Testnet)
    const result = signConsentWithKey(key.toWIF(), HASH, owner)

    expect(result.ok).toBe(true)
    const signature = result.ok ? result.signature : ''
    const sigHex = toHex(Buffer.from(signature, 'base64'))
    const keyId = key.getPublicKey().getPublicKeyHash()

    // Core signs hash.begin(), the reversed 32 bytes; the displayed hash must not verify
    expect(verifyCompact(rawDigest(HASH), sigHex, keyId)).toBe(true)
    expect(verifyCompact(HASH, sigHex, keyId)).toBe(false)
  })

  test('signs from a raw 64-character hex key', () => {
    const key = makeKey()
    const owner = keyIdToAddress(fromHex(key.getPublicKey().getPublicKeyHash()), 'testnet')
    const result = signConsentWithKey(toHex(key.key), HASH, owner)

    expect(result.ok).toBe(true)
  })

  test('refuses a key that owns a different address', () => {
    const mine = makeKey()
    const other = makeKey()
    const result = signConsentWithKey(mine.toWIF(), HASH, other.getPublicKey().getAddress(Network.Testnet))

    expect(result).toEqual({ ok: false, error: expect.stringContaining('not your share owner') })
  })

  test('rejects input that is neither a WIF nor 64 hex characters', () => {
    const result = signConsentWithKey('not-a-key', HASH, keyIdToAddress(new Uint8Array(20), 'testnet'))

    expect(result).toEqual({ ok: false, error: expect.stringContaining('Not a valid WIF') })
  })
})