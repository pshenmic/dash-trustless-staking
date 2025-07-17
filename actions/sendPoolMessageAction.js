import logger from "../logger.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import PoolRepository from "../repositories/PoolRepository.js";
import MessageRepository from "../repositories/MessageRepository.js";

/**
 * @param {DashPlatformSDK} sdk
 * @returns {function(string, string): Promise<Message>}
 */
const sendPoolMessageAction = (sdk) => {
  return async (poolId, text) => {
    const poolRepository = new PoolRepository(sdk);
    const messageRepository = new MessageRepository(sdk);

    // 1. Fetch the pool by ID to ensure it exists
    const pool = await poolRepository.getById(poolId);
    if (!pool) {
      throw new PoolNotFoundError(poolId);
    }

    // 2. Send the message in the pool chat
    const message = await messageRepository.send(poolId, text);

    // 3. Log the sent message
    logger.info(
      `Sent message to pool ${poolId}:\n` +
      JSON.stringify(message, null, 2)
    );

    return message;
  };
};

export default sendPoolMessageAction;
