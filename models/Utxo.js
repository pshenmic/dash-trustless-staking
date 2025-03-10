/**
 * Class representing a UTXO (Unspent Transaction Output).
 */
class Utxo {
  /**
   * Creates an instance of Utxo.
   *
   * @param {string|null} poolId - The ID of the pool where the UTXO is associated.
   * @param {string} txHash - The unique hash of the UTXO.
   * @param {number} vout - The vout of the UTXO.
   * @param {number} satoshis - Amount satoshis of the UTXO.
   * @param {string=} ownerId - Owner identity
   * @param {string=} createdAt - The creation date.
   * @param {string=} updatedAt - The last updated date.
   */
  constructor(poolId, txHash, vout,satoshis, ownerId, createdAt = null, updatedAt = null) {
    this.poolId = poolId;
    this.txHash = txHash;
    this.vout = vout;
    this.satoshis = satoshis;
    this.ownerId = ownerId;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static fromObject(appData) {
    if (appData.toJSON) {
      appData = appData.toJSON();
    }

    return new Utxo(
      appData.poolId,
      appData.txid ?? appData.txHash,
      appData.vout ?? appData.outputIndex,
      appData.satoshis,
      appData['$ownerId'],
      appData['$createdAt'],
      appData['$updatedAt'],
    )
  }
}

export default Utxo;
