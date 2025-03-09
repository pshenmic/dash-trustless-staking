import Dash from "dash";
import bs58 from "bs58";
import Utxo from "../models/Utxo.js";
import config from "../config.js";
import {APP_NAME} from "../constants.js";
import logger from "../logger.js";

const Client = Dash.Client;

class UtxoRepository {
  #docName = "utxo";

  /**
   * @param {Client} sdk - The SDK instance used for interacting with the Dash platform.
   */
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * @param {string} hash
   * @param {number|string} vout
   * @returns {Promise<Utxo>}
   */
  async getByHashAndVout(hash, vout){
    const account = await this.sdk.wallet.getAccount();
    const utxosDocument = account.getUTXOS();
    const utxos = utxosDocument.map(utxo => Utxo.fromObject(utxo));
    return utxos.find(utxo => utxo.txHash === hash && utxo.vout === parseInt(vout));
  }

  /**
   * @param {string} poolId
   * @returns {Promise<[Utxo]>}
   */
  async getUtxosByPoolId(poolId){
    const { platform } = this.sdk;

    const utxoDocuments = await platform.documents.get(
      `${APP_NAME}.${this.#docName}`,
      {where: [['poolId', '==', bs58.decode(poolId)]] },
    )

    if (!utxoDocuments.length) {
      return null;
    }

    return utxoDocuments.map(utxo => Utxo.fromObject(utxo));
  }

  /**
   * @param {Utxo} utxo
   * @returns {Promise<Utxo>}
   */
  async create(utxo){
    const { platform } = this.sdk;

    const identity = await platform.identities.get(config.identity);

    const utxoDocData = {
      ...utxo,
      poolId: bs58.decode(utxo.poolId),
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

    return Utxo.fromObject(utxoDocument);
  }
}

export default UtxoRepository;
