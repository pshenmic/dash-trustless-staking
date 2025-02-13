import config from "../config.js";
import logger from "../logger.js";
import initSdk from "../initSdk.js";

const topUpIdentityAction = () => {
  return async (amount) => {
    const sdk = initSdk();

    amount = parseInt(amount) || 0;

    if (!amount || typeof amount !== 'number' || amount < 50000) {
      // TODO: Make custom exception
      throw new Error('Amount credits for TopUp Identity balance must be specified and greater or equal than 50000');
    }

    const identity = config.identity;

    const { platform } = sdk;

    logger.log("Make TopUp Identity balance");

    await platform.identities.topUp(identity, amount);

    logger.log(`Success!`);

    await sdk.disconnect();
  }
}

export default topUpIdentityAction;
