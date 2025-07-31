import bs58 from "bs58";
import dashcore from "@dashevo/dashcore-lib";
import config from "../config.js";
import logger from "../logger.js";
import PoolRepository from "../repositories/PoolRepository.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import CollateralRepository from "../repositories/CollateralRepository.js";
import ActionProposalRepository from "../repositories/ActionProposalRepository.js";
import UtxoNotFoundError from "../errors/UtxoNotFoundError.js";
import InsufficientCollateralError from "../errors/InsufficientCollateralError.js";

const {Address, Script, Transaction} = dashcore;

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

    const collateralAmount = config.collateralAmount[pool.type]
    const utxoCollateralAmount = collateralUTXOs.reduce(
        (sum, { satoshis }) => sum + satoshis,
        0,
    );
    // if (collateralAmount > utxoCollateralAmount) {
    //   throw new InsufficientCollateralError(collateralAmount, utxoCollateralAmount);
    // }

    const collateralMultisigAddress = Address.createMultisig(
      collateralUTXOs.map(collateral => collateral.collateralPublicKey),
      collateralUTXOs.length,
      config.network,
    );

    const ownerMultisigAddress = Address.createMultisig(
        collateralUTXOs.map(collateral => collateral.ownerPublicKey),
        collateralUTXOs.length,
        config.network,
    );

    const voterMultisigAddress = Address.createMultisig(
        collateralUTXOs.map(collateral => collateral.voterPublicKey),
        collateralUTXOs.length,
        config.network,
    );

    const payOutMultisigAddress = Address.createMultisig(
        collateralUTXOs.map(collateral => collateral.payOutPublicKey),
        collateralUTXOs.length,
        config.network,
    );

    const payload = Transaction.Payload.ProRegTxPayload.fromJSON({
      version: 2,
      collateralHash: '0000000000000000000000000000000000000000000000000000000000000000',
      collateralIndex: -1,
      service: '195.141.0.143:19999', // TODO
      keyIDOwner: ownerMultisigAddress.hashBuffer.toString("hex"),
      pubKeyOperator: pool.blsPublicKey,
      keyIDVoting: voterMultisigAddress.hashBuffer.toString("hex"),
      payoutAddress: payOutMultisigAddress.toString(),
      operatorReward: 0,
      inputsHash: '0000000000000000000000000000000000000000000000000000000000000000', // TODO
    })

    const inputs = collateralUTXOs.map(u => ({
      txid: u.txHash,
      vout: u.vout,
      scriptPubKey: u.script,
      satoshis: u.satoshis,
    }));

    const transaction = new Transaction()
      .from(inputs)
      .to(collateralMultisigAddress.toString(), config.collateralAmount[pool.type])
      .change(payOutMultisigAddress.toString())
      .setType(1)
      .setExtraPayload(payload)

    await actionProposalRepository.create({
      poolId,
      unsignedTxHex: transaction.toString(),
      description,
    })
  }
}

export default finalizePoolAction;
