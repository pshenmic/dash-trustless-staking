import schema from './schema.json' with { type: 'json' };
import { fileURLToPath } from 'url';
import initSdk from "./utils/initSdk.js";
import config from "./config.js";
import signStateTransition from "./utils/signStateTransition.js";
import logger from "./logger.js";

/**
 * Deploy data contract
 * @returns {Promise<void>}
 */
export default async function deployContract() {
    const sdk = initSdk();

    const identityNonce = (await sdk.identities.getIdentityNonce(config.identity)) + 1n;

    const dataContract = await sdk.dataContracts.create(
        config.identity,
        identityNonce,
        schema,
    );

    const stateTransition = await sdk.dataContracts.createStateTransition(
        dataContract,
        'create', // Create
        identityNonce,
    );

    await signStateTransition(stateTransition, sdk);

    await sdk.stateTransitions.broadcast(stateTransition);

    logger.info(`Deployed contract at ${dataContract.id.base58()}`);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    await deployContract();
}