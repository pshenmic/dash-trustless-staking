import Dash from 'dash';

import sdkCacheAdaptor from "./sdkCacheAdaptor.js";
import config from "./config.js";
import logger from "./logger.js";

function initSdk() {

  const network = process.env.NETWORK || 'testnet'

  logger.log("Used network:", network);

  const mnemonic = config.mnemonic;

  const options = {
    network,
    wallet: {
      mnemonic,
      adapter: sdkCacheAdaptor,
    },
    apps: {
      TrustlessPooledStaking: {
        contractId: process.env.CONTRACT_ID,
      }
    }
  };

  if (config.skipSynchronizationBeforeHeight) {
    options.wallet.unsafeOptions = {
      skipSynchronizationBeforeHeight: config.skipSynchronizationBeforeHeight,
    };
  }

  return new Dash.Client(options);
}

export default initSdk;
