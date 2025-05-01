import Dash from "dash";
import {APP_NAME} from "../constants.js";
import Pool from "../models/Pool.js";
import PoolStatusEnum from "../models/enums/PoolStatusEnum.js";
import MasternodeTypeEnum from "../models/enums/MasternodeTypeEnum.js";
import InvalidPoolTypeError from "../errors/InvalidPoolTypeError.js";
import logger from "../logger.js";
import config from "../config.js";

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
  async getById(id){
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

  /**
   * @param {Pool} pool - Thr Pool instance to create
   * @returns {Promise<Pool>}
   */
  async create(pool) {
    const { platform } = this.sdk;

    logger.info(`Creating pool: ${pool.name}`);

    const identity = await platform.identities.get(config.identity);

    const poolDocument = await platform.documents.create(
      `${APP_NAME}.${this.#docName}`,
      identity,
      {...pool, createdAt: undefined, updatedAt: undefined, id: undefined},
    )

    const documentBatch = {
      create: [poolDocument],
      replace: [],
      delete: [],
    };

    logger.log("Broadcasting Pool Document");
    await platform.documents.broadcast(documentBatch, identity);
    logger.log("Done..",`Pool Document at: ${poolDocument.getId()}`);

    return Pool.fromDocument(poolDocument);
  }

  /**
   * Lists Pools with pagination support.
   *
   * @param {Buffer|string|null} startAt - The Buffer or ID of the last document from the previous page.
   * @param {number} limit - Number of pools to fetch per page.
   * @returns {Promise<{ pools: Pool[], nextStartAt: string|null }>}
   */
  async list(startAt = null, limit = 10) {
    const { platform } = this.sdk;

    // Build the query object
    const query = {
      limit,
      ...(startAt && { startAt }),
    };

    const documents = await platform.documents.get(
      `${APP_NAME}.${this.#docName}`,
      query,
    );

    // Map raw documents to Pool instances
    const pools = documents.map((doc) => Pool.fromDocument(doc));

    // Determine nextStartAt by taking the ID of the last document
    let nextStartAt = null;
    if (documents.length > 0 && documents.length === limit) {
      nextStartAt = documents[documents.length - 1].getId();
    }

    return { pools, nextStartAt };
  }

}

export default PoolRepository;
