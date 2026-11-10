#!/usr/bin/env node
/*
 * Produces the same consent signature as `protx shared_sign <hex>` without Dash Core.
 * The share owner's WIF is used to sign the consent digest with a 65-byte compact signature,
 * which is what the app recovers and compares against the share's keyIDOwner.
 *
 * Usage: node scripts/sign-consent.mjs <registration tx hex> <share owner WIF>
 */
import { Transaction, PrivateKey, consentHash, signCompact } from 'dash-core-sdk'

const [hex, wif] = process.argv.slice(2)

if (hex == null || wif == null) {
  console.error('Usage: node scripts/sign-consent.mjs <registration tx hex> <share owner WIF>')
  process.exit(1)
}

const tx = Transaction.fromHex(hex)
const payload = tx.extraPayload

if (payload?.shares == null || payload.shares.length === 0) {
  console.error('Not a shared registration: the payload has no share table')
  process.exit(1)
}

const digest = consentHash(tx)
const key = PrivateKey.fromWIF(wif)
const keyId = key.getPublicKey().getPublicKeyHash()
const shareIndex = payload.shares.findIndex(share => share.keyIdOwner === keyId)

if (shareIndex < 0) {
  const owners = payload.shares.map((share, index) => `${index}:${share.keyIdOwner}`).join(', ')
  console.error(`This key (${keyId}) owns no share in this transaction.\nShare owners: ${owners}\nConsent hash: ${digest}`)
  process.exit(1)
}

console.log(JSON.stringify({
  shareIndex,
  digest,
  signature: Buffer.from(signCompact(digest, key), 'hex').toString('base64')
}, null, 2))