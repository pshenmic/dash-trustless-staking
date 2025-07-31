/**
 * Class representing Pool join record.
 */
class Collateral {
  /**
   * Creates an instance of Utxo.
   *
   * @param {string|null} poolId - The ID of the pool where the UTXO is associated.
   * @param {string} address - The address of the UTXO.
   * @param {string} txHash - The unique hash of the UTXO.
   * @param {number} vout - The vout of the UTXO.
   * @param {string} script - The script of the UTXO.
   * @param {number} satoshis - Amount satoshis of the UTXO.
   * @param {string=} ownerId - Owner identity
   * @param {string=} collateralPublicKey - collateral publicKey
   * @param {string=} ownerPublicKey - owner publicKey
   * @param {string=} voterPublicKey - voter publicKey
   * @param {string=} payOutPublicKey - payOut publicKey
   * @param {string=} createdAt - The creation date.
   * @param {string=} updatedAt - The last updated date.
   */
  constructor(
      poolId,
      address,
      txHash,
      vout,
      script,
      satoshis,
      ownerId,
      collateralPublicKey,
      ownerPublicKey,
      voterPublicKey,
      payOutPublicKey,
      createdAt = null,
      updatedAt = null) {
    this.poolId = poolId;
    this.address = address;
    this.txHash = txHash;
    this.vout = vout;
    this.script = script;
    this.satoshis = satoshis;
    this.ownerId = ownerId;
    this.collateralPublicKey = collateralPublicKey;
    this.ownerPublicKey = ownerPublicKey;
    this.voterPublicKey = voterPublicKey;
    this.payOutPublicKey = payOutPublicKey;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static fromDocument(appData) {
    return new Collateral(
      appData.poolId ?? appData.properties?.poolId,
      appData.address ?? appData.properties?.address,
      appData.txid ?? appData.properties.txHash,
      appData.outputIndex ?? appData.properties.vout,
      appData.script ?? appData.properties.script,
      appData.satoshis ?? appData.properties.satoshis,
      appData['$ownerId'] ?? appData.ownerId?.base58(),
      (appData.collateralPublicKey ?? appData.properties?.collateralPublicKey) || '',
      (appData.ownerPublicKey ?? appData.properties?.ownerPublicKey) || '',
      (appData.voterPublicKey ?? appData.properties?.voterPublicKey) || '',
      (appData.payOutPublicKey ?? appData.properties?.payOutPublicKey) || '',
      appData['$createdAt'] ?? appData.createdAt?.toString() ?? String(Date.now()),
      appData['$updatedAt'] ?? appData.createdAt?.toString() ?? String(Date.now()),
    )
  }
}

export default Collateral;
