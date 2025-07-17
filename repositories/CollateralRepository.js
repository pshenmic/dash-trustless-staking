import bs58 from "bs58";
import Collateral from "../models/Collateral.js";
import config from "../config.js";
import {APP_NAME} from "../constants.js";
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
        0, // Create
        identityContractNonce + 1n,
    );

    await signStateTransition(stateTransition, this.sdk);

    await this.sdk.stateTransitions.broadcast(stateTransition);

    logger.log("Broadcasting collateral UTXO Document");
    await this.sdk.stateTransitions.broadcast(stateTransition);
    logger.log("Done..",`Collateral UTXO Document at: ${utxoDocument.getId()}`);

    return Collateral.fromDocument(utxoDocument);
  }
}

export default CollateralRepository;
