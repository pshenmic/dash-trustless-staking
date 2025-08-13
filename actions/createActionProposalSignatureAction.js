import logger from "../logger.js";
import ActionProposalNotFoundError from "../errors/ActionProposalNotFoundError.js";
import ActionProposalRepository from "../repositories/ActionProposalRepository.js";
import ActionProposalSignatureRepository from "../repositories/ActionProposalSignatureRepository.js";

/**
 * @param {DashPlatformSDK} sdk
 * @returns {function(string, string): Promise<ActionProposalSignature>}
 */
const createActionProposalSignatureAction = (sdk) => {
  return async (proposalId, signature) => {
    const proposalRepo = new ActionProposalRepository(sdk);
    const proposal = await proposalRepo.getById(proposalId);
    if (!proposal) {
      throw new ActionProposalNotFoundError(proposalId);
    }

    const sigRepo = new ActionProposalSignatureRepository(sdk);
    const sig = await sigRepo.create({ proposalId, signature });

    logger.info(
      `Created signature ${sig.id} for proposal ${proposalId}:\n` +
      JSON.stringify(sig, null, 2)
    );

    return sig;
  };
};

export default createActionProposalSignatureAction;
