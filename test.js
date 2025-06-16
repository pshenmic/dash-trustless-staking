#!/usr/bin/env node

import initSdk from './utils/initSdk.js';


(async () => {
    // 1. Initialize your SDK (mnemonic already wired up in initSdk)
    const sdk = initSdk();

    try {

        // 2. Get the wallet account
        const account = await sdk.wallet.getAccount();

        // const [privateKey] = account.getPrivateKeys(['yYvaZskDdJXaR2FFSDh2xEPGmUskdfFBEp'])

        const utxosDocument = account.getUTXOS();

        console.log(utxosDocument);


    } catch (err) {
        console.error('Error fetching public key:', err);
        process.exit(1);
    } finally {
        await sdk.disconnect();
    }
})();

async function addressToPublicKey(sdk, address) {
    const account = await sdk.wallet.getAccount();

    const [privateKey] = account.getPrivateKeys([address])

    return  privateKey.publicKey.toString();
}