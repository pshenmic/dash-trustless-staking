import config from "../config.js";
import logger from "../logger.js";
import initSdk from "../initSdk.js";
import InvalidTopUpAmountError from "../errors/InvalidTopUpAmountError.js";

const topUpIdentityAction = () => {
  return async (amount) => {
    const sdk = initSdk();

    amount = parseInt(amount) || 0;

    if (!amount || typeof amount !== 'number' || amount < 50000) {
      throw new InvalidTopUpAmountError(amount);
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
