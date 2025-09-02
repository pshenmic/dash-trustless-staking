/**
 * Class representing a signature for an action proposal.
 */
class ActionProposalSignature {
  /**
   * @param {string} proposalId - ID of the action_proposal document.
   * @param {string} signature - The member's signature string.
   * @param {Uint8Array|Buffer} ownerId - Identity ID of the signer.
   * @param {string=} createdAt - ISO timestamp when created.
   * @param {string=} updatedAt - ISO timestamp when updated.
   */
  constructor(proposalId, signature, ownerId, createdAt = undefined, updatedAt = undefined) {
    this.proposalId = proposalId;
    this.signature = signature;
    this.ownerId = ownerId;
    this.createdAt = createdAt ?? null;
    this.updatedAt = updatedAt ?? null;
  }

  /**
   * Instantiate from a Dash Document.
   *
   * @param {DocumentWASM} data
   * @returns {ActionProposalSignature}
   */
  static fromDocument(data) {
    return new ActionProposalSignature(
      data.properties.proposalId,
      data.properties.signature,
      data.ownerId.base58(),
      data.createdAt?.toString() ?? String(Date.now()),
      data.createdAt?.toString() ?? String(Date.now()),
    );
  }
}

export default ActionProposalSignature;
