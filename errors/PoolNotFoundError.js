class PoolNotFoundError extends Error {
  /**
   * @param {string} poolId
   */
  constructor(poolId = undefined) {
    const message = poolId
      ? `Pool with ID ${poolId} not found`
      : 'Pool not found'
    super(message);
    this.name = 'PoolNotFoundError';
  }
}

export default PoolNotFoundError;
