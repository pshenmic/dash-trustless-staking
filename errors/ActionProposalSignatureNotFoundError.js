/**
 * Error thrown when an action proposal signature cannot be found by ID.
 */
class ActionProposalSignatureNotFoundError extends Error {
  /**
   * @param {string=} signatureId - The ID of the missing signature.
   */
  constructor(signatureId = undefined) {
    const message = signatureId
      ? `Action proposal signature with ID ${signatureId} not found`
      : 'Action proposal signature not found';
    super(message);
    this.name = 'ActionProposalSignatureNotFoundError';
  }
}

export default ActionProposalSignatureNotFoundError;
