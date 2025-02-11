import Dash from 'dash';

import cacheAdaptor from "./storage/cacheAdaptor.js";
import config from "./storage/config.js";

const createClientConfig = (mnemonic) => {
  return () => {
    if (!mnemonic) {
      throw new Error("Mnemonic not set as argument");
    }

    const options = {
      network: "testnet",
      wallet: {
        mnemonic,
        adapter: cacheAdaptor,
      },
      apps: {
        TrustlessPoolStaking: {
          contractId: process.env.CONTRACT_ID,
        }
      }
    };

    if (process.env.SKIP_SYNCHRONIZATION_BEFORE_HEIGHT) {
      options.wallet.unsafeOptions = {
        skipSynchronizationBeforeHeight: Number(process.env.SKIP_SYNCHRONIZATION_BEFORE_HEIGHT),
      };
    }

    return options;
  };
};

function initClient() {

  const mnemonic = config.mnemonic;

  const clientConfig = createClientConfig(mnemonic);

  return new Dash.Client(clientConfig());
}

export default initClient;
