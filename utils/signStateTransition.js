import {PrivateKeyWASM} from 'pshenmic-dpp/dist/wasm/pshenmic_dpp.js';
import config from "../config.js";

/**
 * @param {StateTransitionWASM} stateTransition
 * @param {DashPlatformSDK} sdk - The SDK instance
 * @returns {void}
 */

export default async function signStateTransition(stateTransition, sdk) {
    const wallet = await sdk.keyPair.mnemonicToWallet(config.mnemonic, undefined, true, { versions: config.network })

    // TODO
    const key = await sdk.keyPair.walletToIdentityKey(wallet, 0, 1)

    const privateKeyWASM = PrivateKeyWASM.fromBytes(key.privateKey, config.network)
    const identityPublicKeys = await sdk.identities.getIdentityPublicKeys(config.identity)
    stateTransition.sign(privateKeyWASM, identityPublicKeys[1])
}