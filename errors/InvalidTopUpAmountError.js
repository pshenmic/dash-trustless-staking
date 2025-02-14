class InvalidTopUpAmountError extends Error {
  /**
   *
   * @param {number=} amount TopUp amount
   */
  constructor(amount) {
    const message = amount
      ? `Invalid top-up amount: ${amount}. Amount must be specified and greater or equal to 50000.`
      : `Amount must be specified and greater or equal to 50000.`
    super(message);
    this.name = 'InvalidTopUpAmountError';
  }
}

export default InvalidTopUpAmountError;
