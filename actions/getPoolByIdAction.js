import logger from "../logger.js";
import initSdk from "../initSdk.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import PoolRepository from "../repositories/PoolRepository.js";
import UtxoRepository from "../repositories/UtxoRepository.js";
import retrieveUtxo from "../retrieveUtxo.js";
import PoolMember from "../models/PoolMember.js";

const getPoolByIdAction = () => {
  return async (poolId) => {
    const sdk = initSdk();

    const poolRepository = new PoolRepository(sdk);

    const pool = await poolRepository.getById(poolId);

    if (!pool) {
      throw new PoolNotFoundError(poolId);
    }

    logger.info(`Fetched pool document:\n${JSON.stringify(pool, null, 2)}`);

    const pooInfo = await getPoolInfo(sdk, poolId);

    logger.info('Pool Info:\n', pooInfo)

    await sdk.disconnect();

    return pool;
  }
}

const getPoolInfo = async (sdk, poolId) => {
  const utxoRepository = new UtxoRepository(sdk);

  const utxos = await utxoRepository.getUtxosByPoolId(poolId);

  const poolUtxos = []
  for (const utxo of utxos) {
    const poolUtxo = await retrieveUtxo(sdk, utxo.txHash, utxo.vout);
    if (poolUtxo) {
      // TODO validation poolUtxo
      poolUtxo.ownerId = utxo.ownerId;
      poolUtxos.push(poolUtxo);
    }
  }

  const totalMembers = poolUtxos.length;
  const balance = poolUtxos.reduce((totalBalance, poolUtxo) => totalBalance+=poolUtxo.satoshis, 0)
  const membersInfo = poolUtxos.map((poolUtxo) => new PoolMember(poolUtxo.ownerId, poolUtxo.satoshis));

  return {totalMembers, balance, membersInfo};
}

export default getPoolByIdAction;
