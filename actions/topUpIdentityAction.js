import config from "../config.js";
import logger from "../logger.js";
import InvalidTopUpAmountError from "../errors/InvalidTopUpAmountError.js";

/**
 * @param {DashPlatformSDK} sdk
 * @returns {(function(number): Promise<void>)|*}
 */
const topUpIdentityAction = (sdk) => {
  return async (amount) => {
    amount = parseInt(amount) || 0;

    if (!amount || typeof amount !== 'number' || amount < 50000) {
      throw new InvalidTopUpAmountError(amount);
    }

    const identity = config.identity;

    const { platform } = sdk;

    logger.log("Make TopUp Identity balance");

    await platform.identities.topUp(identity, amount);

    logger.log(`Success!`);
  }
}

export default topUpIdentityAction;
