import ActionProposalRepository from "../repositories/ActionProposalRepository.js";
import ActionProposalNotFoundError from "../errors/ActionProposalNotFoundError.js";

/**
 * @param {Client} sdk
 * @returns {function(string): Promise<ActionProposal>}
 */
const getActionProposalByIdAction = (sdk) => {
  return async (proposalId) => {
    const repo = new ActionProposalRepository(sdk);

    // Fetch the proposal by ID
    const proposal = await repo.getById(proposalId);

    // Throw custom error if not found
    if (!proposal) {
      throw new ActionProposalNotFoundError(proposalId);
    }

    return proposal;
  };
};

export default getActionProposalByIdAction;
