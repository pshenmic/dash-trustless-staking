import logger from "../logger.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import PoolRepository from "../repositories/PoolRepository.js";
import UtxoRepository from "../repositories/UtxoRepository.js";
import fetchUtxoByTxHashAndVout from "../utils/fetchUtxoByTxHashAndVout.js";
import PoolMember from "../models/PoolMember.js";

/**
 * @param {Client} sdk
 * @returns {function(string): Promise<Pool>}
 */
const getPoolByIdAction = (sdk) => {
  return async (poolId) => {
    const poolRepository = new PoolRepository(sdk);
    const utxoRepository = new UtxoRepository(sdk);

    const pool = await poolRepository.getById(poolId);

    if (!pool) {
      throw new PoolNotFoundError(poolId);
    }

    const utxos = await utxoRepository.getByPoolId(poolId);

    // Retrieve all UTXOs in parallel using map + Promise.all
    // If utxos is not defined or is empty, return an empty array to avoid errors
    const rawPoolUtxos = Array.isArray(utxos) && utxos.length > 0
      ? await Promise.all(
        utxos.map(async (utxo) => {
          // Retrieve UTXO for each element
          const poolUtxo = await fetchUtxoByTxHashAndVout(sdk, utxo.txHash, utxo.vout);
          if (!poolUtxo) {
            return null; // Skip if fetchUtxo returns nothing
          }
          // TODO: validate poolUtxo
          return { ...poolUtxo, ownerId: utxo.ownerId };
        })
      )
      : [];

    // Filter out null entries
    const poolUtxos = rawPoolUtxos.filter(Boolean);

    const totalMembers = poolUtxos.length;
    const balance = poolUtxos.reduce((totalBalance, poolUtxo) => totalBalance+=poolUtxo.satoshis, 0)
    const membersInfo = poolUtxos.map((poolUtxo) => new PoolMember(poolUtxo.ownerId, poolUtxo.satoshis));

    const pooInfo =  {totalMembers, balance, membersInfo};

    logger.info(`Fetched pool document:\n${JSON.stringify(pool, null, 2)}`);
    logger.info(`Pool Info:\n${JSON.stringify(pooInfo, null, 2)}`);

    return pool;
  }
}

export default getPoolByIdAction;
