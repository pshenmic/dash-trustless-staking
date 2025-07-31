/**
 * Error thrown when the provided collateral is less than required.
 */
class InsufficientCollateralError extends Error {
  /**
   * @param {number=} requiredCollateral - The minimum collateral required.
   * @param {number=} currentCollateral - The collateral that was actually provided.
   */
  constructor(requiredCollateral = undefined, currentCollateral = undefined) {
    let message;
    if (
        typeof requiredCollateral === 'number' &&
        typeof currentCollateral === 'number'
    ) {
      message = `Insufficient collateral: required ${requiredCollateral}, but got ${currentCollateral}`;
    } else if (typeof requiredCollateral === 'number') {
      message = `Insufficient collateral: required ${requiredCollateral}`;
    } else {
      message = 'Insufficient collateral amount';
    }

    super(message);
    this.name = 'InsufficientCollateralError';

    this.requiredCollateral = requiredCollateral;
    this.currentCollateral = currentCollateral;
  }
}

export default InsufficientCollateralError;
