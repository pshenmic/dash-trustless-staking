import { Network as CoreNetwork, PrivateKey, signCompact } from 'dash-core-sdk'
import { base64 } from '@scure/base'
import { addressToKeyId } from './address.js'
import { fromHex, toHex } from './bytes.js'
import { rawDigest } from './registration.js'
import type { Network } from './types.js'

/** App-side network for address helpers; the SDK enum is a different type with different values */
const NETWORK: Network = 'testnet'

export type SignConsentResult = { ok: true, signature: string } | { ok: false, error: string }

/**
 * Signs a consent digest in the browser with a private key the user pastes. Accepts a WIF or a
 * 64-character hex key and refuses any key that does not own the share, so a wrong paste cannot
 * produce a signature the pool would reject.
 */
export function signConsentWithKey (privateKeyText: string, consentHash: string, ownerAddress: string): SignConsentResult {
  let key: PrivateKey

  try {
    const text = privateKeyText.trim()
    key = /^[0-9a-fA-F]{64}$/.test(text)
      ? new PrivateKey(fromHex(text), CoreNetwork.Testnet, true)
      : PrivateKey.fromWIF(text)
  } catch {
    return { ok: false, error: 'Not a valid WIF or 64-character hex private key' }
  }

  const keyId = key.getPublicKey().getPublicKeyHash()
  const expected = toHex(addressToKeyId(ownerAddress, NETWORK))

  if (keyId !== expected) {
    return { ok: false, error: `This key owns another address (${keyId.slice(0, 8)}…), not your share owner ${expected.slice(0, 8)}…` }
  }

  return { ok: true, signature: base64.encode(fromHex(signCompact(rawDigest(consentHash), key))) }
}