import config from "../storage/config.js";

const topUpIdentityActionFactory = (initClient) => {
  const client = initClient();

  return async (amount) => {

    try {
      amount = parseInt(amount) || 0;

      if (!amount || typeof amount !== 'number' || amount < 50000) {
        throw new Error('Amount credits for TopUp Identity balance must be specified and greater or equal than 50000');
      }

      const identity = config.identity;

      const client = initClient();
      const { platform } = client;

      console.log("Make TopUp Identity balance");

      await platform.identities.topUp(identity, amount);

      console.log(`Success!`);

      return true;
    } catch (e) {
      console.error(e);
      return false;
    } finally {
      client.disconnect();
    }

  }
}

export default topUpIdentityActionFactory;
