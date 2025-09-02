import bs58 from "bs58";
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

import PublicKey from "@dashevo/dashcore-lib/lib/publickey.js";
import TransactionSignature from "@dashevo/dashcore-lib/lib/transaction/signature.js";


const signTxAction = (sdk) => {
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

    const actionProposalSignatures = await actionProposalSignatureRepository.getAllByProposalId(proposalId);

    const identity = await sdk.identities.getIdentityByIdentifier(config.identity);
    const isMember = collateralUTXOs.some((doc) => doc.ownerId === identity.id.base58());
    if (!isMember) {
      throw new UserNotInPoolError(actionProposal.poolId);
    }

    // TODO Check that there are enough signatures. actionProposalSignatures >= collateralUTXOs * multisigThreshold

    logger.info(`Signing ActionProposal: ${proposalId}`);

    const tx = await createProRegTx(collateralUTXOs, pool.blsPublicKey, pool.type);

    if (tx.toString() !== actionProposal.transactionHex) {
      throw new Error('Transaction Error. The transaction in actionProposal and the newly generated one do not match.');
    }

    const latestSignatures = [...actionProposalSignatures.reduce((map, sig) => {
      const existing = map.get(sig.ownerId);
      if (!existing || Number(sig.createdAt) > Number(existing.createdAt)) {
        map.set(sig.ownerId, sig);
      }
      return map;
    }, new Map()).values()];

    latestSignatures.forEach((signature, index) => {
      const utxo = collateralUTXOs.find(collateralUTXO => collateralUTXO.ownerId === signature.ownerId);
      if (!utxo) {
        throw new UtxoNotFoundError();
      }
      const publicKey = new PublicKey(utxo.collateralPublicKey, {network: config.network});
      const txSig = TransactionSignature.fromObject({
        publicKey,
        prevTxId: utxo.txHash,
        outputIndex: utxo.vout,
        inputIndex: index,
        signature: signature.signature,
        sigtype: 1,
      })
      tx.applySignature(txSig);
    })

    console.log(tx.toString('hex'));
  };
};

export default signTxAction;
