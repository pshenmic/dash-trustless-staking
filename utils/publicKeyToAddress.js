import dashcore from "@dashevo/dashcore-lib"
import config from "../config.js";

/**
 * @param {string} publicKey
 * @returns {Promise<string>}
 */
export default async function publicKeyToAddress(publicKey) {
    const pubKey = new dashcore.PublicKey(publicKey);
    const address = dashcore.Address.fromPublicKey(
        pubKey,
        config.network,
    ).toString();
    return address;
}