class CollateralUtxoAlreadyExist extends Error {
  constructor() {
    super('Collateral Utxo already exist. You can only enter the pool once.');
    this.name = 'CollateralUtxoAlreadyExist';
  }
}

export default CollateralUtxoAlreadyExist;
