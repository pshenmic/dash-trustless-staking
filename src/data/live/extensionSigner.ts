import { getExtension } from '../../wallet/extension'
import type { Signer } from './platform'
import { toHex } from '../../lib/bytes'

/**
 * Signs through Dash Platform Extension. The extension shows the transition to the user, signs it with
 * the identity key and broadcasts it itself. The transition is passed as a hex string.
 */
export const extensionSigner: Signer = async stateTransition => {
  const signer = getExtension()
  if (signer == null) throw new Error('Dash Platform Extension is not installed')
  await signer.signAndBroadcast(toHex(stateTransition.bytes()))
}
