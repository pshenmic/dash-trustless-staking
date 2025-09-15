import logger from '../logger.js';
import { saveMnemonic } from '../utils/mnemonicStore.js';

const initAction = (sdk) => {
  return async (mnemonicPhrase) => {
    const mnemonic = Array.isArray(mnemonicPhrase)
      ? mnemonicPhrase.join(' ')
      : String(mnemonicPhrase || '').trim();

    if (!mnemonic) {
      throw new Error('Mnemonic is required');
    }

    // Validate using SDK (derivation will throw on invalid)
    try {
      await sdk.keyPair.mnemonicToWallet(mnemonic);
    } catch (e) {
      throw new Error(`Invalid mnemonic: ${e.message}`);
    }

    const file = await saveMnemonic(mnemonic, { overwrite: true });
    logger.info(`Mnemonic saved to: ${file} (permissions 600)`);
    logger.info('NOTE: Do NOT commit this file to VCS.');
  };
};

export default initAction;
