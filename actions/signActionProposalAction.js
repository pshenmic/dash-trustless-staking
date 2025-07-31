import logger from "../logger.js";

const signActionProposalAction = (sdk) => {
  return async (proposalId) => {
    logger.info(`Signing ActionProposal: ${proposalId}`);
  };
};

export default signActionProposalAction;
