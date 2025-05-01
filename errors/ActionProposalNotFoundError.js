/**
 * Error thrown when an action proposal cannot be found by ID.
 */
class ActionProposalNotFoundError extends Error {
  /**
   * @param {string=} proposalId - The ID of the missing proposal.
   */
  constructor(proposalId = undefined) {
    const message = proposalId
      ? `Action proposal with ID ${proposalId} not found`
      : 'Action proposal not found';
    super(message);
    this.name = 'ActionProposalNotFoundError';
  }
}

export default ActionProposalNotFoundError;
