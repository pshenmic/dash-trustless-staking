import config from "../config.js";
import logger from "../logger.js";
import InvalidTopUpAmountError from "../errors/InvalidTopUpAmountError.js";

import Dash from 'dash';
const Client = Dash.Client;

/**
 * @returns {(function(Client, number): Promise<void>)|*}
 */
const topUpIdentityAction = () => {
  return async (sdk, amount) => {
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
