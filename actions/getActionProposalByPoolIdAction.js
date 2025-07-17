// actions/getActionProposalByPoolIdAction.js
import logger from "../logger.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import PoolRepository from "../repositories/PoolRepository.js";
import ActionProposalRepository from "../repositories/ActionProposalRepository.js";

/**
 * @param {DashPlatformSDK} sdk
 * @returns {function(string): Promise<ActionProposal[]>}
 */
const getActionProposalByPoolIdAction = (sdk) => {
  return async (poolId) => {
    // 1. Fetch the pool and ensure it exists
    const poolRepository = new PoolRepository(sdk);
    const pool = await poolRepository.getById(poolId);
    if (!pool) {
      throw new PoolNotFoundError(poolId);
    }

    // 2. Fetch action proposals created by the pool owner
    const proposalRepository = new ActionProposalRepository(sdk);
    const proposals = await proposalRepository.getByPoolId(poolId);

    // 3. Log fetched proposals
    logger.info(
      `Fetched ${proposals.length} action proposal(s) for pool ${poolId}:\n` +
      JSON.stringify(proposals, null, 2)
    );

    return proposals;
  };
};

export default getActionProposalByPoolIdAction;
