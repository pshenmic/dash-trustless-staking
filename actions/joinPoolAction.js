import PoolRepository from "../repositories/PoolRepository.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import CollateralRepository from "../repositories/CollateralRepository.js";
import UtxoNotFoundError from "../errors/UtxoNotFoundError.js";
import Collateral from "../models/Collateral.js";

/**
 * @param {Client} sdk
 * @returns {(function(string, string, number): Promise<void>)|*}
 */
const joinPoolAction = (sdk) => {
  return async (poolId, utxoHash, utxoIndex) => {
    const poolRepository = new PoolRepository(sdk);
    const collateralRepository = new CollateralRepository(sdk);

    // Check pool available and get pool
    const pool = await poolRepository.getById(poolId);
    if (!pool) {
      throw new PoolNotFoundError(poolId);
    }

    // Check utxo available and utxo amount validation
    const account = await sdk.wallet.getAccount();
    const utxosDocument = account.getUTXOS();
    const [utxo] = utxosDocument
      .filter(utxo => utxo.outputIndex === parseInt(utxoIndex) && utxo.txId === utxoHash);

    if (!utxo) {
      throw new UtxoNotFoundError();
    }
    // TODO amount validation

    const [privateKey] = account.getPrivateKeys([utxo.address.toString()]);

    const collateral = Collateral.fromObject(utxo)

    collateral.publicKey = privateKey.publicKey.toString();

    collateral.poolId = poolId;

    // Broadcast utxo document
    await collateralRepository.create(collateral);
  }
}

export default joinPoolAction;
