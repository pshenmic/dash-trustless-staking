import logger from "../logger.js";
import ActionProposalNotFoundError from "../errors/ActionProposalNotFoundError.js";
import ActionProposalRepository from "../repositories/ActionProposalRepository.js";
import ActionProposalSignatureRepository from "../repositories/ActionProposalSignatureRepository.js";

/**
 * @param {DashPlatformSDK} sdk
 * @returns {function(string): Promise<ActionProposalSignature[]>}
 */
const getActionProposalSignatureByProposalIdAction = (sdk) => {
  return async (proposalId) => {
    const proposalRepo = new ActionProposalRepository(sdk);
    const proposal = await proposalRepo.getById(proposalId);
    if (!proposal) {
      throw new ActionProposalNotFoundError(proposalId);
    }

    const sigRepo = new ActionProposalSignatureRepository(sdk);
    const signatures = await sigRepo.getAllByProposalId(proposalId);

    logger.info(
      `Fetched ${signatures.length} signature(s) for proposal ${proposalId}:\n` +
      JSON.stringify(signatures, null, 2)
    );

    return signatures;
  };
};

export default getActionProposalSignatureByProposalIdAction;
