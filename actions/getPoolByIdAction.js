import logger from "../logger.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import PoolRepository from "../repositories/PoolRepository.js";
import CollateralRepository from "../repositories/CollateralRepository.js";
import MessageRepository from "../repositories/MessageRepository.js";
import PoolMember from "../models/PoolMember.js";

const getPoolByIdAction = (sdk) => {
  return async (poolId) => {
    const poolRepository = new PoolRepository(sdk);
    const collateralRepository = new CollateralRepository(sdk);
    const messageRepository = new MessageRepository(sdk);

    const pool = await poolRepository.getById(poolId);

    if (!pool) {
      throw new PoolNotFoundError(poolId);
    }

    const utxos = await collateralRepository.getByPoolId(poolId);

    // TODO: actualize UTXO
    const poolUtxos = Array.isArray(utxos) ? utxos : [];

    const totalMembers = poolUtxos.length;
    const balance = poolUtxos.reduce((sum, u) => sum + u.satoshis, 0);
    const membersInfo = poolUtxos.map(u => new PoolMember(u.ownerId, u.satoshis));

    const poolInfo = { totalMembers, balance, membersInfo };

    logger.info(`Fetched pool document:\n${JSON.stringify(pool, null, 2)}`);
    logger.info(`Pool Info:\n${JSON.stringify(poolInfo, null, 2)}`);

    const messages = await messageRepository.get(poolId);
    logger.info(
        `Chat messages for pool ${poolId}:\n` +
        JSON.stringify(messages, null, 2)
    );

    return pool;
  };
};

export default getPoolByIdAction;
