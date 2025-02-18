import logger from "../logger.js";
import Pool from "../models/Pool.js";
import initSdk from "../initSdk.js";
import {getDocumentById} from "../utils.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";

const getPoolByIdAction = () => {
  return async (poolId) => {
    const sdk = initSdk();

    const poolDocument = (await getDocumentById(sdk, 'pools', poolId))[0];

    if (!poolDocument) {
      throw new PoolNotFoundError(poolId);
    }

    const pool = Pool.fromAppData(poolDocument);

    logger.info(`Fetched pool document:\n${JSON.stringify(pool, null, 2)}`);

    await sdk.disconnect();

    return pool;
  }
}

export default getPoolByIdAction;
