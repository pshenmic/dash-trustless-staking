import {PrivateKeyWASM} from 'pshenmic-dpp/dist/wasm/pshenmic_dpp.js';
import config from "../config.js";

/**
 * @param {StateTransitionWASM} stateTransition
 * @param {DashPlatformSDK} sdk - The SDK instance
 * @returns {void}
 */

export default async function signStateTransition(stateTransition, sdk) {
    const wallet = await sdk.keyPair.mnemonicToWallet(config.mnemonic);

    const privateKeyWASM = PrivateKeyWASM.fromBytes(wallet.privateKey, config.network)

    // TODO
    stateTransition.sign(privateKeyWASM, (await sdk.identities.getIdentityPublicKeys(config.identity))[1])
}