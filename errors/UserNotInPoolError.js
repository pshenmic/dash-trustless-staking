/**
 * Error thrown when a user is not a member of a pool.
 */
class UserNotInPoolError extends Error {
  /**
   * @param {string=} poolId - The ID of the pool the user attempted to access.
   */
  constructor(poolId = undefined) {
    const message = poolId
      ? `User is not a member of pool ${poolId}`
      : 'User is not a member of pool';
    super(message);
    this.name = 'UserNotInPoolError';
  }
}

export default UserNotInPoolError;
