/**
 * Class representing an action proposal.
 */
class ActionProposal {
  /**
   * Creates an instance of ActionProposal.
   * @param {string} poolId - Base58-encoded ID of the pool.
   * @param {string} transactionHex - Unsigned multisig transaction in hex.
   * @param {string} description - Human-readable explanation of the proposal.
   * @param {string=} createdAt - ISO timestamp when the proposal was created.
   * @param {string=} updatedAt - ISO timestamp when the proposal was last updated.
   */
  constructor(poolId, transactionHex, description, createdAt = undefined, updatedAt = undefined) {
    this.poolId = poolId;
    this.transactionHex = transactionHex;
    this.description = description;
    this.createdAt = createdAt ?? null;
    this.updatedAt = updatedAt ?? null;
  }

  /**
   * Instantiate an ActionProposal from a Dash Document.
   *
   * @param {DocumentWASM} appData - Document returned by Dash SDK.
   * @returns {ActionProposal}
   */
  static fromDocument(appData) {
    return new ActionProposal(
      appData.properties.poolId,
      appData.properties.unsignedTxHex,
      appData.properties.description,
      appData.createdAt?.toString() ?? String(Date.now()),
      appData.createdAt?.toString() ?? String(Date.now()),
    );
  }
}

export default ActionProposal;
