import logger from "../logger.js";
import ActionProposalSignatureNotFoundError from "../errors/ActionProposalSignatureNotFoundError.js";
import ActionProposalSignatureRepository from "../repositories/ActionProposalSignatureRepository.js";

/**
 * @param {DashPlatformSDK} sdk
 * @returns {function(string): Promise<ActionProposalSignature>}
 */
const getActionProposalSignatureByIdAction = (sdk) => {
  return async (signatureId) => {
    const sigRepo = new ActionProposalSignatureRepository(sdk);
    const sig = await sigRepo.getById(signatureId);
    if (!sig) {
      throw new ActionProposalSignatureNotFoundError(signatureId);
    }

    logger.info(
      `Fetched signature ${signatureId}:\n` +
      JSON.stringify(sig, null, 2)
    );

    return sig;
  };
};

export default getActionProposalSignatureByIdAction;
