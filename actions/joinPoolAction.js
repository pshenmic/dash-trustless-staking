import PoolRepository from "../repositories/PoolRepository.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import UtxoRepository from "../repositories/UtxoRepository.js";
import UtxoNotFoundError from "../errors/UtxoNotFoundError.js";
import Utxo from "../models/Utxo.js";

import Dash from 'dash';
const Client = Dash.Client;

/**
 * @returns {(function(Client, string, string, number): Promise<void>)|*}
 */
const joinPoolAction = () => {
  return async (sdk, poolId, utxoHash, utxoIndex) => {
    const poolRepository = new PoolRepository(sdk);
    const utxoRepository = new UtxoRepository(sdk);

    // Check pool available and get pool
    const pool = await poolRepository.getById(poolId);
    if (!pool) {
      throw new PoolNotFoundError(poolId);
    }

    // Check utxo available and utxo amount validation
    const account = await this.sdk.wallet.getAccount();
    const utxosDocument = account.getUTXOS();
    const [utxo] = utxosDocument
      .map(utxo => Utxo.fromObject(utxo))
      .filter(utxo => utxo.vout === utxoIndex && utxo.txHash === utxoHash);

    if (!utxo) {
      throw new UtxoNotFoundError();
    }
    // TODO amount validation

    utxo.poolId = poolId;

    // Broadcast utxo document
    await utxoRepository.create(utxo);
  }
}

export default joinPoolAction;
