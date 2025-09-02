import bs58 from "bs58";
import dashcore from "@dashevo/dashcore-lib";
import logger from "../logger.js";
import config from "../config.js";
import ActionProposalRepository from "../repositories/ActionProposalRepository.js";
import CollateralRepository from "../repositories/CollateralRepository.js";
import PoolRepository from "../repositories/PoolRepository.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import UtxoNotFoundError from "../errors/UtxoNotFoundError.js";
import UserNotInPoolError from "../errors/UserNotInPoolError.js";
import ActionProposalNotFoundError from "../errors/ActionProposalNotFoundError.js";
import {createProRegTx} from "../utils/createProRegTx.js";
import ActionProposalSignatureRepository from "../repositories/ActionProposalSignatureRepository.js";

const {PrivateKey, Address, Script, Transaction} = dashcore;

const signActionProposalAction = (sdk) => {
  return async (proposalId) => {
    const actionProposalSignatureRepository = new ActionProposalSignatureRepository(sdk);
    const actionProposalRepository = new ActionProposalRepository(sdk);
    const poolRepository = new PoolRepository(sdk);
    const collateralRepository = new CollateralRepository(sdk);

    const actionProposal = await actionProposalRepository.getById(proposalId);
    if (!actionProposal) {
      throw new ActionProposalNotFoundError();
    }

    const pool = await poolRepository.getById(actionProposal.poolId);
    if (!pool) {
      throw new PoolNotFoundError(actionProposal.poolId)
    }

    const collateralUTXOs = await collateralRepository.getByPoolId(bs58.decode(actionProposal.poolId));
    if (!collateralUTXOs?.length) {
      throw new UtxoNotFoundError();
    }

    const identity = await sdk.identities.getIdentityByIdentifier(config.identity);
    const isMember = collateralUTXOs.some((doc) => doc.ownerId === identity.id.base58());
    if (!isMember) {
      throw new UserNotInPoolError(actionProposal.poolId);
    }

    logger.info(`Signing ActionProposal: ${proposalId}`);

    const tx = await createProRegTx(collateralUTXOs, pool.blsPublicKey, pool.type);

    if (tx.toString() !== actionProposal.transactionHex) {
      throw new Error('Transaction Error. The transaction in actionProposal and the newly generated one do not match.');
    }

    const wallet = await sdk.keyPair.mnemonicToWallet(config.mnemonic);
    // TODO get privateKey
    const privateKey = new PrivateKey(
      "e8d594cb3cd2df1b23237ed771d968b7d30bb436b8ac1bc45b8496512984924e",
      config.network
    );

    const [sig] = tx
        .getSignatures(privateKey)
        .map((sig) => sig.signature.toDER().toString("hex"));

    await actionProposalSignatureRepository.create(proposalId, sig)
  };
};

export default signActionProposalAction;
