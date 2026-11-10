import type { DashPlatformSDK } from 'dash-platform-sdk'
import { PrivateKeyWASM, type IdentityPublicKeyWASM, type StateTransitionWASM } from 'pshenmic-dpp'
import { extensionSigner } from '../data/live/extensionSigner'
import type { Signer } from '../data/live/platform'
import { currentSession } from './authSession'

const keyCache = new Map<string, IdentityPublicKeyWASM>()

/** Forgets the cached identity key after logout or a new login. */
export function clearSignerKeyCache (): void {
  keyCache.clear()
}

/**
 * The one signer the live backend uses. A private-key session signs and broadcasts locally; with no
 * session it falls through to the extension (kept for the extension release, not reachable from the
 * login dialog yet).
 */
export function createSigner (sdk: DashPlatformSDK): Signer {
  return async stateTransition => {
    const session = currentSession()
    if (session?.mode !== 'privateKey') {
      await extensionSigner(stateTransition)
      return
    }

    const cacheKey = `${session.identityId}:${session.authKeyId}`
    let publicKey = keyCache.get(cacheKey)
    if (publicKey == null) {
      const keys = await sdk.identities.getIdentityPublicKeys(session.identityId)
      publicKey = keys.find(key => key.keyId === session.authKeyId)
      if (publicKey == null) {
        throw new Error('The identity key for this session no longer exists. Log in again.')
      }
      keyCache.set(cacheKey, publicKey)
    }

    const transition = stateTransition as unknown as StateTransitionWASM
    const privateKey = PrivateKeyWASM.fromWIF(session.authKeyWif)
    transition.sign(privateKey, publicKey)
    await sdk.stateTransitions.broadcast(transition)
    await sdk.stateTransitions.waitForStateTransitionResult(transition)
  }
}