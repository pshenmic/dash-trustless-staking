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

  if (process.env.SKIP_SYNCHRONIZATION_BEFORE_HEIGHT) {
    options.wallet.unsafeOptions = {
      skipSynchronizationBeforeHeight: Number(process.env.SKIP_SYNCHRONIZATION_BEFORE_HEIGHT),
    };
  }

  return new Dash.Client(options);
}

export default initSdk;
