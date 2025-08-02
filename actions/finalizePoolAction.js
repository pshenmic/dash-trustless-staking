import bs58 from "bs58";
import logger from "../logger.js";
import PoolRepository from "../repositories/PoolRepository.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import CollateralRepository from "../repositories/CollateralRepository.js";
import ActionProposalRepository from "../repositories/ActionProposalRepository.js";
import UtxoNotFoundError from "../errors/UtxoNotFoundError.js";
import {createProRegTx} from "../utils/createProRegTx.js";

/**
 * @param {DashPlatformSDK} sdk
 * @returns {(function(string, string): Promise<ActionProposal>)|*}
 */
const finalizePoolAction = (sdk) => {
  return async (poolId, description) => {
    const poolRepository = new PoolRepository(sdk);
    const collateralRepository = new CollateralRepository(sdk);
    const actionProposalRepository = new ActionProposalRepository(sdk);

    // Check pool available and get pool
    const pool = await poolRepository.getById(poolId);
    if (!pool) {
      throw new PoolNotFoundError(poolId);
    }

    logger.log(`Finalize pool ${pool.name}\nReason: ${description}`);

    // Fetch collateral utxo for check and calculate sum satoshis.
    const collateralUTXOs = await collateralRepository.getByPoolId(bs58.decode(pool.id));
    if (!collateralUTXOs?.length) {
      throw new UtxoNotFoundError()
    }

    const transaction = await createProRegTx(collateralUTXOs, pool.blsPublicKey, pool.type);

    await actionProposalRepository.create({
      poolId,
      unsignedTxHex: transaction.toString(),
      description,
    })
  }
}

export default finalizePoolAction;
