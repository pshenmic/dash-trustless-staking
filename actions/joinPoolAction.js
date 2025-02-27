import logger from "../logger.js";
import initSdk from "../initSdk.js";
import PoolRepository from "../repositories/PoolRepository.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import UtxoRepository from "../repositories/UtxoRepository.js";
import UtxoNotFoundError from "../errors/UtxoNotFoundError.js";

const joinPoolAction = () => {
  return async (poolId, utxoHash, utxoIndex) => {
    const sdk = initSdk();

    const poolRepository = new PoolRepository(sdk);
    const utxoRepository = new UtxoRepository(sdk);

    // Check pool available and get pool
    const pool = await poolRepository.getById(poolId);
    if (!pool) {
      throw new PoolNotFoundError(poolId);
    }

    // Check utxo available and utxo amount validation
    const utxo = await utxoRepository.getByHashAndVout(utxoHash, utxoIndex);
    if (!utxo) {
      throw new UtxoNotFoundError();
    }
    // TODO amount validation

    utxo.poolId = poolId;

    // Broadcast utxo document
    await utxoRepository.create(utxo);

    await sdk.disconnect();
  }
}

export default joinPoolAction;
