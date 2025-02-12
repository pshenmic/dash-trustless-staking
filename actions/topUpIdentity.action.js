import config from "../config.js";
import logger from "../logger.js";

const topUpIdentityAction = (sdk) => {
  return async (amount) => {
    let result = false;
    try {
      amount = parseInt(amount) || 0;

      if (!amount || typeof amount !== 'number' || amount < 50000) {
        throw new Error('Amount credits for TopUp Identity balance must be specified and greater or equal than 50000');
      }

      const identity = config.identity;

      const { platform } = sdk;

      logger.log("Make TopUp Identity balance");

      await platform.identities.topUp(identity, amount);

      logger.log(`Success!`);

      result = true;
    } catch (e) {
      logger.error(e);
    } finally {
      sdk.disconnect();
    }
    return result;
  }
}

export default topUpIdentityAction;
