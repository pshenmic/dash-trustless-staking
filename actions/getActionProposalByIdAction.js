import logger from "../logger.js";
import ActionProposalNotFoundError from "../errors/ActionProposalNotFoundError.js";
import ActionProposalRepository from "../repositories/ActionProposalRepository.js";
import ActionProposalSignatureRepository from "../repositories/ActionProposalSignatureRepository.js"; // см. ниже

/**
 * @param {DashPlatformSDK} sdk
 * @returns {function(string): Promise<ActionProposal>}
 */
const getActionProposalByIdAction = (sdk) => {
  return async (proposalId) => {
    const proposalRepo = new ActionProposalRepository(sdk);
    const signatureRepo = new ActionProposalSignatureRepository(sdk);

    // 1. Fetch the proposal by ID
    const proposal = await proposalRepo.getById(proposalId);
    if (!proposal) {
      throw new ActionProposalNotFoundError(proposalId);
    }

    // 2. Fetch all signatures for this proposal
    const signatures = await signatureRepo.getAllByProposalId(proposalId);

    // 3. Log the proposal and its signatures
    logger.info(
      `Fetched action proposal:\n${JSON.stringify(proposal, null, 2)}`
    );
    logger.info(
      `Signatures for proposal ${proposalId}:\n${JSON.stringify(
        signatures,
        null,
        2
      )}`
    );

    return proposal;
  };
};

export default getActionProposalByIdAction;
