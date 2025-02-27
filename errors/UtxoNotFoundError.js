class UtxoNotFoundError extends Error {
  constructor() {
    super('Utxo not found');
    this.name = 'UtxoNotFoundError';
  }
}

export default UtxoNotFoundError;
