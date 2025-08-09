import logger from "../logger.js";
import PoolRepository from "../repositories/PoolRepository.js";
import PoolNotFoundError from "../errors/PoolNotFoundError.js";
import ActionProposalRepository from "../repositories/ActionProposalRepository.js";
import OnlyPoolOwnerError from "../errors/OnlyPoolOwnerError.js";
import config from "../config.js";

/**
 * @param {Client} sdk
 * @returns {function(string, string, string): Promise<ActionProposal>}
 */
const createActionProposalAction = (sdk) => {
  return async (poolId, transactionHex, description) => {
    const poolRepo = new PoolRepository(sdk);

    // 1. Ensure the pool exists
    const pool = await poolRepo.getById(poolId);
    if (!pool) {
      throw new PoolNotFoundError(poolId);
    }

    // 2. Ensure caller is the pool owner
    const identity = await sdk.platform.identities.get(config.identity);
    const ownerId = identity.getId().toString();
    if (ownerId !== pool.ownerId) {
      throw new OnlyPoolOwnerError(poolId);
    }

    // 3. Create the proposal
    const proposalRepo = new ActionProposalRepository(sdk);
    const proposal = await proposalRepo.create({
      poolId,
      transactionHex,
      description,
    });

    // 4. Log the created proposal
    logger.info(
      `Created action proposal:\n${JSON.stringify(proposal, null, 2)}`
    );

    return proposal;
  };
};

export default createActionProposalAction;
