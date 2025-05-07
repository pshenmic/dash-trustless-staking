/**
 * Error thrown when someone other than the pool owner attempts an owner-only action.
 */
class OnlyPoolOwnerError extends Error {
  /**
   * @param {string=} poolId - ID of the pool for context.
   */
  constructor(poolId = undefined) {
    const message = poolId
      ? `Only the pool owner can perform this action on pool ${poolId}`
      : 'Only the pool owner can perform this action';
    super(message);
    this.name = 'OnlyPoolOwnerError';
  }
}

export default OnlyPoolOwnerError;
