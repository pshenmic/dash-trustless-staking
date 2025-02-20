import logger from "../logger.js";
import initSdk from "../initSdk.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import PoolRepository from "../repositories/PoolRepository.js";

const getPoolByIdAction = () => {
  return async (poolId) => {
    const sdk = initSdk();

    const poolRepository = new PoolRepository(sdk);

    const pool = await poolRepository.getPoolById(poolId);

    if (!pool) {
      throw new PoolNotFoundError(poolId);
    }

    logger.info(`Fetched pool document:\n${JSON.stringify(pool, null, 2)}`);

    await sdk.disconnect();

    return pool;
  }
}

export default getPoolByIdAction;
