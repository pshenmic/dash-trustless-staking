import PoolRepository from "../repositories/PoolRepository.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import CollateralRepository from "../repositories/CollateralRepository.js";
import UtxoNotFoundError from "../errors/UtxoNotFoundError.js";
import Collateral from "../models/Collateral.js";
import getUTXOsByAddress from "../externalApis/getUTXOsByAddress.js";
import CollateralUtxoAlreadyExist from "../errors/CollateralUtxoAlreadyExist.js";

/**
 * @param {DashPlatformSDK} sdk
 * @returns {(function(string, string, string, string, string, string, string, string): Promise<void>)|*}
 */
const joinPoolAction = (sdk) => {
  return async (
      poolId,
      utxoAddress,
      utxoHash,
      utxoIndex,
      collateralPublicKey,
      ownerPublicKey,
      voterPublicKey,
      payOutPublicKey,
      ) => {
    const poolRepository = new PoolRepository(sdk);
    const collateralRepository = new CollateralRepository(sdk);

    // Check pool available and get pool
    const pool = await poolRepository.getById(poolId);
    if (!pool) {
      throw new PoolNotFoundError(poolId);
    }

    // TODO UTXO amount validation

    const [utxo] = await getUTXOsByAddress([utxoAddress]);
    if (!utxo) {
      throw new UtxoNotFoundError();
    }

    // TODO Check for duplication Collateral
    const availableCollateral = await collateralRepository.getByAddress(utxoAddress);
    if (availableCollateral?.length) {
      throw new CollateralUtxoAlreadyExist();
    }

    const collateral = Collateral.fromDocument({
      poolId,
      address: utxoAddress,
      txid: utxoHash,
      outputIndex: parseInt(utxoIndex),
      script: utxo.script,
      satoshis: utxo.satoshis,
      undefined,
      collateralPublicKey,
      ownerPublicKey,
      voterPublicKey,
      payOutPublicKey,
      createdAt: undefined,
      updatedAt: undefined,
    })

    // Broadcast utxo collateral document
    await collateralRepository.create(collateral);
  }
}

export default joinPoolAction;
