import Dash from "dash";
import bs58 from "bs58";
import Collateral from "../models/Collateral.js";
import config from "../config.js";
import {APP_NAME} from "../constants.js";
import logger from "../logger.js";

const Client = Dash.Client;

class CollateralRepository {
  #docName = "collateral";

  /**
   * @param {Client} sdk - The SDK instance used for interacting with the Dash platform.
   */
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * @param {string} poolId
   * @returns {Promise<[Collateral]>}
   */
  async getByPoolId(poolId){
    const { platform } = this.sdk;

    const collateralDocuments = await platform.documents.get(
      `${APP_NAME}.${this.#docName}`,
      {where: [['poolId', '==', bs58.decode(poolId)]] },
    )

    if (!collateralDocuments.length) {
      return null;
    }

    return collateralDocuments.map(collateral => Collateral.fromObject(collateral));
  }

  /**
   * @param {Collateral} collateral
   * @returns {Promise<Collateral>}
   */
  async create(collateral){
    const { platform } = this.sdk;

    const identity = await platform.identities.get(config.identity);

    const utxoDocData = {
      ...collateral,
      poolId: bs58.decode(collateral.poolId),
      createdAt: undefined,
      updatedAt: undefined,
    }

    const utxoDocument = await platform.documents.create(
      `${APP_NAME}.${this.#docName}`,
      identity,
      utxoDocData,
    )

    const documentBatch = {
      create: [utxoDocument],
      replace: [],
      delete: [],
    };

    logger.log("Broadcasting UTXO Document");
    await platform.documents.broadcast(documentBatch, identity);
    logger.log("Done..",`UTXO Document at: ${utxoDocument.getId()}`);

    return Collateral.fromObject(utxoDocument);
  }
}

export default CollateralRepository;
