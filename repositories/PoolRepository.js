import Dash from "dash";
import {APP_NAME} from "../constants.js";
import Pool from "../models/Pool.js";

const Client = Dash.Client;

class PoolRepository {
  #docName = 'pool';

  /**
   * @param {Client} sdk - The SDK instance used for interacting with the Dash platform.
   */
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Retrieves a Pool from the Dash platform by its ID.
   *
   * @param {string} id - The unique identifier of the Pool to be retrieved.
   * @returns {Promise<Pool>}
   */
  async getPoolById(id){
    const { platform } = this.sdk;

    const [poolDocument] = await platform.documents.get(
      `${APP_NAME}.${this.#docName}`,
      {where: [['$id', '==', id]] },
    )

    if (!poolDocument) {
      return null;
    }

    return Pool.fromDocument(poolDocument);
  }
}

export default PoolRepository;
