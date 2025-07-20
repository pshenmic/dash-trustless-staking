// blsKeyPair.mjs

import crypto from 'crypto';
import BlsSignatures from '@dashevo/bls';
import { fileURLToPath } from 'url';

/**
 * Derives a BLS public key hex string from a given private key hex string.
 *
 * @param {string} privateKeyHex
 * @returns {Promise<string>} Public key as hex string
 */
async function getBLSPublicKeyFromPrivateKeyHex(privateKeyHex) {
    // Load the BLS WASM module and extract PrivateKey class
    const { PrivateKey } = await BlsSignatures();

    // Convert hex string to Buffer
    const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');

    // Create a PrivateKey instance from raw bytes (true = big endian)
    const privateKey = PrivateKey.fromBytes(privateKeyBuffer, true);

    // Derive the public key (G1 point)
    const publicKey = privateKey.getG1();

    // Serialize and return as hex string
    return Buffer.from(publicKey.serialize()).toString('hex');
}

/**
 * Generates a random BLS key pair.
 *
 * @returns {Promise<{ secretKey: string, publicKey: string }>}
 */
export async function generateBlsKeyPair() {
    // Generate 32 random bytes and convert to hex (private key)
    const privateKeyHex = crypto.randomBytes(32).toString('hex');

    // Derive the corresponding public key
    const publicKeyHex = await getBLSPublicKeyFromPrivateKeyHex(privateKeyHex);

    return {
        secretKey: privateKeyHex,
        publicKey: publicKeyHex,
    };
}

// If this module is run directly, generate a key pair and print it
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    generateBlsKeyPair()
        .then((kp) => console.log('BLS Key Pair:', kp))
        .catch((err) => console.error(err));
}
