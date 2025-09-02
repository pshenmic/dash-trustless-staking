import bs58 from "bs58";
import Collateral from "../models/Collateral.js";
import config from "../config.js";
import logger from "../logger.js";
import signStateTransition from "../utils/signStateTransition.js";

class CollateralRepository {
  #docName = "collateral";

  /**
   * @param {DashPlatformSDK} sdk - The SDK instance used for interacting with the Dash platform.
   */
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * @param {string} address
   * @returns {Promise<Collateral[]>}
   */
  async getByAddress(address) {
    const collateralDocuments = await this.sdk.documents.query(
        config.contractId,
        this.#docName,
        [["address", "==", address]],
        null,
    )

    if (!collateralDocuments.length) {
      return null;
    }

    return collateralDocuments.map(collateral => Collateral.fromDocument(collateral));
  }

  /**
   * @param {string} poolId
   * @returns {Promise<[Collateral]>}
   */
  async getByPoolId(poolId){
    const collateralDocuments = await this.sdk.documents.query(
        config.contractId,
        this.#docName,
        [["poolId", "==", poolId]],
        null,
    )

    if (!collateralDocuments.length) {
      return null;
    }

    return collateralDocuments.map(collateral => Collateral.fromDocument(collateral));
  }

  /**
   * @param {Collateral} collateral
   * @returns {Promise<Collateral>}
   */
  async create(collateral){
    logger.info(`Creating collateral UTXO for pool ${collateral.poolId}`);

    // 1. Получаем текущий nonce для нашей identity в контракте
    const identityContractNonce = await this.sdk.identities.getIdentityContractNonce(
        config.identity,
        config.contractId,
    );

    delete (collateral.ownerId)
    delete (collateral.createdAt)
    delete (collateral.updatedAt)

    const utxoDoc = await this.sdk.documents.create(
        config.contractId,
        this.#docName,
        {
          // остальные поля копируются, а poolId декодируется в Buffer
          ...collateral,
          poolId: bs58.decode(collateral.poolId),
        },
        config.identity,
    );

    const stateTransition = await this.sdk.documents.createStateTransition(
        utxoDoc,
        'create', // Create
        identityContractNonce + 1n,
    );

    await signStateTransition(stateTransition, this.sdk);

    logger.log("Broadcasting collateral UTXO Document");
    await this.sdk.stateTransitions.broadcast(stateTransition);
    logger.log("Done..",`Collateral UTXO Document at: ${utxoDoc.id.base58()}`);

    return Collateral.fromDocument(utxoDoc);
  }
}

export default CollateralRepository;
