import Dash from "dash";
import bs58 from "bs58";
import { APP_NAME } from "../constants.js";
import ActionProposal from "../models/ActionProposal.js";
import config from "../config.js";
import logger from "../logger.js";

const Client = Dash.Client;

class ActionProposalRepository {
  #docName = "action_proposal";

  /**
   * @param {Client} sdk - Dash SDK instance
   */
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Fetch a proposal by its document ID.
   *
   * @param {string} proposalId - Base58-encoded ID of the action_proposal document.
   * @returns {Promise<ActionProposal|null>}
   */
  async getById(proposalId) {
    const { platform } = this.sdk;

    const [doc] = await platform.documents.get(
      `${APP_NAME}.${this.#docName}`,
      { where: [["$id", "==", proposalId]] }
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
   * @returns {Promise<ActionProposal[]>}
   */
  async getByPoolId(poolId) {
    const { platform } = this.sdk;
    const poolIdBuffer = bs58.decode(poolId);

    const docs = await platform.documents.get(
      `${APP_NAME}.${this.#docName}`,
      { where: [["poolId", "==", poolIdBuffer]] }
    );

    return docs.map((doc) => ActionProposal.fromDocument(doc));
  }

  /**
   * Create a new action proposal. Only the pool owner should call this.
   *
   * @param {object} proposalData
   * @param {string} proposalData.poolId - Base58-encoded Pool ID.
   * @param {string} proposalData.transactionHex - Unsigned multisig transaction hex.
   * @param {string} proposalData.description - Human-readable description.
   * @returns {Promise<ActionProposal>}
   */
  async create({ poolId, transactionHex, description }) {
    const { platform } = this.sdk;

    // Load the identity that will sign the document
    const identity = await platform.identities.get(config.identity);

    logger.info(`Creating action proposal for pool ${poolId}`);

    // Prepare the raw document data
    const docData = {
      poolId: bs58.decode(poolId),
      transactionHex,
      description,
      createdAt: undefined,
      updatedAt: undefined,
    };

    // Create the document
    const proposalDoc = await platform.documents.create(
      `${APP_NAME}.${this.#docName}`,
      identity,
      docData
    );

    // Broadcast the new proposal
    const batch = {
      create: [proposalDoc],
      replace: [],
      delete: [],
    };
    logger.log("Broadcasting ActionProposal document");
    await platform.documents.broadcast(batch, identity);

    logger.log(
      "Done..",
      `ActionProposal Document at: ${proposalDoc.getId()}`
    );

    return ActionProposal.fromDocument(proposalDoc);
  }
}

export default ActionProposalRepository;
