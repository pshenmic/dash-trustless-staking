import Dash from "dash";
import { APP_NAME } from "../constants.js";
import ActionProposalSignature from "../models/ActionProposalSignature.js";
import config from "../config.js";
import logger from "../logger.js";

class ActionProposalSignatureRepository {
  #docName = "action_proposal_signature";

  /**
   * @param {Client} sdk
   */
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Fetch all signatures for a given proposal.
   *
   * @param {string} proposalId
   * @returns {Promise<ActionProposalSignature[]>}
   */
  async getByProposalId(proposalId) {
    const { platform } = this.sdk;
    const docs = await platform.documents.get(
      `${APP_NAME}.${this.#docName}`,
      { where: [["proposalId", "==", proposalId]] }
    );
    return docs.map((doc) => ActionProposalSignature.fromDocument(doc));
  }

  /**
   * Fetch a single signature by its document ID.
   *
   * @param {string} signatureId
   * @returns {Promise<ActionProposalSignature|null>}
   */
  async getById(signatureId) {
    const { platform } = this.sdk;
    const [doc] = await platform.documents.get(
      `${APP_NAME}.${this.#docName}`,
      { where: [["$id", "==", signatureId]] }
    );
    return doc ? ActionProposalSignature.fromDocument(doc) : null;
  }

  /**
   * Create a new signature for an action proposal.
   *
   * @param {object} params
   * @param {string} params.proposalId
   * @param {string} params.signature
   * @returns {Promise<ActionProposalSignature>}
   */
  async create({ proposalId, signature }) {
    const { platform } = this.sdk;
    const identity = await platform.identities.get(config.identity);

    logger.info(`Creating signature for proposal ${proposalId}`);

    const sigDoc = await platform.documents.create(
      `${APP_NAME}.${this.#docName}`,
      identity,
      { proposalId, signature }
    );

    await platform.documents.broadcast(
      { create: [sigDoc], replace: [], delete: [] },
      identity,
    );
    logger.log("Done..", `Signature Document at: ${sigDoc.getId()}`);

    return ActionProposalSignature.fromDocument(sigDoc);
  }
}

export default ActionProposalSignatureRepository;
