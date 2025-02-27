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
   * @returns {Promise<[Utxo]>}
   */
  async get(){
    const account = await this.sdk.wallet.getAccount();
    const utxosDocument = account.getUTXOS();
    return utxosDocument.map(utxo => Utxo.fromDocument(utxo));
  }

  /**
   * @param {string} hash
   * @param {number|string} vout
   * @returns {Promise<Utxo>}
   */
  async getByHashAndVout(hash, vout){
    const utxos = await this.get();
    return utxos.find(utxo => utxo.txHash === hash && utxo.vout === parseInt(vout));
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

    return Utxo.fromDocument(utxoDocument);
  }
}

export default UtxoRepository;
