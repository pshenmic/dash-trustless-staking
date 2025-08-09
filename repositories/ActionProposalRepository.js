import Dash from "dash";
import { APP_NAME } from "../constants.js";
import ActionProposal from "../models/ActionProposal.js";
import config from "../config.js";
import logger from "../logger.js";

/**
 * Repository for action_proposal documents.
 */
class ActionProposalRepository {
  #docName = "action_proposal";

  /**
   * @param {Client} sdk - Dash SDK Client instance.
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
    const { platform } = this.sdk;

    const [doc] = await platform.documents.get(
      `${APP_NAME}.${this.#docName}`,
      { where: [["$id", "==", proposalId]] },
    );

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
    const { platform } = this.sdk;

    const docs = await platform.documents.get(
      `${APP_NAME}.${this.#docName}`,
      { where: [["poolId", "==", poolId]] },
    );

    return docs.map((doc) => ActionProposal.fromDocument(doc));
  }

  /**
   * Create a new action proposal. Only the pool owner should call this.
   *
   * @param {object} proposalData - Data for the new proposal.
   * @param {string} proposalData.poolId - Base58-encoded Pool ID.
   * @param {string} proposalData.transactionHex - Unsigned multisig transaction hex.
   * @param {string} proposalData.description - Human-readable description.
   * @returns {Promise<ActionProposal>}
   */
  async create({ poolId, transactionHex, description }) {
    const { platform } = this.sdk;

    // Load identity that signs the document (pool owner)
    const identity = await platform.identities.get(config.identity);

    logger.info(`Creating action proposal for pool ${poolId}`);

    const proposalDoc = await platform.documents.create(
      `${APP_NAME}.${this.#docName}`,
      identity,
      { poolId, transactionHex, description },
    );

    const batch = {
      create: [proposalDoc],
      replace: [],
      delete: [],
    };

    logger.log("Broadcasting ActionProposal document");
    await platform.documents.broadcast(batch, identity);
    logger.log("Done..", `ActionProposal Document at: ${proposalDoc.getId()}`);

    return ActionProposal.fromDocument(proposalDoc);
  }
}

export default ActionProposalRepository;

