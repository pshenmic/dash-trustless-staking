// Shared setup for the testnet scripts: credentials from .env.local, an SDK instance, and signing.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DashPlatformSDK } from 'dash-platform-sdk'
import { PrivateKeyWASM } from 'pshenmic-dpp'

const envFile = fileURLToPath(new URL('../.env.local', import.meta.url))
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8').split('\n')
    .filter(line => line.includes('=') && !line.trim().startsWith('#'))
    .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])
)

export const identityId = env.PLATFORM_IDENTITY_ID
if (identityId == null || env.PLATFORM_IDENTITY_PRIVATE_KEY == null) {
  throw new Error('Set PLATFORM_IDENTITY_ID and PLATFORM_IDENTITY_PRIVATE_KEY in .env.local')
}

export const sdk = new DashPlatformSDK({ network: 'testnet' })
export const privateKey = PrivateKeyWASM.fromWIF(env.PLATFORM_IDENTITY_PRIVATE_KEY)

/** The identity public key that matches the configured private key */
export async function signingKey () {
  const keys = await sdk.identities.getIdentityPublicKeys(identityId)
  const hash = privateKey.getPublicKeyHash()
  const key = keys.find(k => k.getPublicKeyHash() === hash)
  if (key == null) throw new Error('The private key matches none of the identity public keys')
  return key
}

/** Signs with the identity key, broadcasts and waits for the result */
export async function signAndBroadcast (stateTransition) {
  stateTransition.sign(privateKey, await signingKey())
  await sdk.stateTransitions.broadcast(stateTransition)
  return await sdk.stateTransitions.waitForStateTransitionResult(stateTransition)
}
