import ActionProposal from "../models/ActionProposal.js";
import config from "../config.js";
import logger from "../logger.js";
import signStateTransition from "../utils/signStateTransition.js";

/**
 * Repository for action_proposal documents.
 */
class ActionProposalRepository {
  #docName = "action_proposal";

  /**
   * @param {DashPlatformSDK} sdk - Dash SDK Client instance.
   */
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Fetch a proposal by its document ID.
   *
   * @param {string} proposalId - Base58-encoded ID of the action_proposal document.
   * @returns {Promise<ActionProposal|null>} ActionProposal instance or null if not found.
   */
  async getById(proposalId) {
    const [doc] = await this.sdk.documents.query(
        config.contractId,
        this.#docName,
        [["$id", "==", proposalId]],
        null,
        1
    )

    if (!doc) {
      return null;
    }

    return ActionProposal.fromDocument(doc);
  }

  /**
   * Fetch all proposals created for a specific pool.
   *
   * @param {string} poolId - Base58-encoded Pool ID.
   * @returns {Promise<ActionProposal[]>} Array of ActionProposal instances.
   */
  async getByPoolId(poolId) {
    const documents = await this.sdk.documents.query(
        config.contractId,
        this.#docName,
        [["poolId", "==", poolId]],
        null,
    )

    return documents.map((doc) => ActionProposal.fromDocument(doc));
  }

  /**
   * Create a new action proposal. Only the pool owner should call this.
   *
   * @param {object} proposalData - Data for the new proposal.
   * @param {string} proposalData.poolId - Base58-encoded Pool ID.
   * @param {string} proposalData.unsignedTxHex - Unsigned multisig transaction hex.
   * @param {string} proposalData.description - Human-readable description.
   * @returns {Promise<ActionProposal>}
   */
  async create({ poolId, unsignedTxHex, description }) {
    logger.info(`Creating action proposal for pool ${poolId}`);

    const identityContractNonce = await this.sdk.identities.getIdentityContractNonce(
        config.identity,
        config.contractId,
    );

    const proposalDoc = await this.sdk.documents.create(
        config.contractId,
        this.#docName,
        { poolId, unsignedTxHex, description },
        config.identity,
    );

    const stateTransition = await this.sdk.documents.createStateTransition(
        proposalDoc,
        'create',
        identityContractNonce + 1n,
    );

    await signStateTransition(stateTransition, this.sdk);

    logger.log("Broadcasting ActionProposal document");
    await this.sdk.stateTransitions.broadcast(stateTransition);
    logger.log("Done..", `ActionProposal Document at: ${proposalDoc.id.base58()}`);

    return ActionProposal.fromDocument(proposalDoc);
  }
}

export default ActionProposalRepository;

