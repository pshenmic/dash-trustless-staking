import ActionProposalSignature from "../models/ActionProposalSignature.js";
import config from "../config.js";
import logger from "../logger.js";
import signStateTransition from "../utils/signStateTransition.js";

class ActionProposalSignatureRepository {
  #docName = "action_proposal_signature";

  /**
   * @param {DashPlatformSDK} sdk
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
  async getAllByProposalId(proposalId) {
    const docs = await this.sdk.documents.query(
        config.contractId,
        this.#docName,
        [["proposalId", "==", proposalId]],
        null,
    )
    return docs.map((doc) => ActionProposalSignature.fromDocument(doc));
  }

  /**
   * Fetch a single signature by its document ID.
   *
   * @param {string} signatureId
   * @returns {Promise<ActionProposalSignature|null>}
   */
  async getById(signatureId) {
    const [doc] = await this.sdk.documents.query(
        config.contractId,
        this.#docName,
        [["$id", "==", signatureId]],
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
    logger.info(`Creating signature for proposal ${proposalId}`);

    const identityContractNonce = await this.sdk.identities.getIdentityContractNonce(
        config.identity,
        config.contractId,
    );

    const sigDoc = await this.sdk.documents.create(
        config.contractId,
        this.#docName,
        {
          proposalId,
          signature,
        },
        config.identity,
    );

    const stateTransition = await this.sdk.documents.createStateTransition(
        sigDoc,
        0, // Create
        identityContractNonce + 1n,
    );

    await signStateTransition(stateTransition, this.sdk);

    await this.sdk.stateTransitions.broadcast(stateTransition);

    logger.log("Done..", `Signature Document at: ${sigDoc.id.base58()}`);

    return ActionProposalSignature.fromDocument(sigDoc);
  }
}

export default ActionProposalSignatureRepository;
