// import Dash from "dash";
// import {APP_NAME} from "../constants.js";
import Pool from "../models/Pool.js";
// import PoolStatusEnum from "../models/enums/PoolStatusEnum.js";
// import MasternodeTypeEnum from "../models/enums/MasternodeTypeEnum.js";
// import InvalidPoolTypeError from "../errors/InvalidPoolTypeError.js";
import logger from "../logger.js";
import config from "../config.js";

import signStateTransition from "../utils/signStateTransition.js";


class PoolRepository {
  #docName = 'pool';

  /**
   * @param {DashPlatformSDK} sdk - The SDK instance used for interacting with the Dash platform.
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

    const [poolDocument] = await this.sdk.documents.query(
        config.contractId,
        this.#docName,
        [["$id", "==", id]],
        [],
        1
    );

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
    logger.info(`Creating pool: ${pool.name}`);

    const identityContractNonce = await this.sdk.identities.getIdentityContractNonce(
        config.identity,
        config.contractId,
    );

    const poolDoc = await this.sdk.documents.create(
        config.contractId,
        this.#docName,
        {
          name:           pool.name,
          description:    pool.description,
          type:           pool.type,
          status:         pool.status,
          bls_public_key: pool.blsPublicKey,
        },
        config.identity,
    );

    const stateTransition = await this.sdk.documents.createStateTransition(
        poolDoc,
        0,
        identityContractNonce + 1n,
    );

    await signStateTransition(stateTransition, this.sdk);

    await this.sdk.stateTransitions.broadcast(stateTransition);

    logger.info(`🆕 Pool document broadcasted, id=${poolDoc.id}`);

    // return Pool.fromDocument(poolDocument);
  }

  /**
   * Lists Pools with pagination support.
   *
   * @param {Buffer|string|null} startAt - The Buffer or ID of the last document from the previous page.
   * @param {number} limit - Number of pools to fetch per page.
   * @returns {Promise<{ pools: Pool[], nextStartAt: string|null }>}
   */
  async list(startAt = null, limit = 10) {

    const query = [
        config.contractId,
        this.#docName,
        null,
        null,
        limit,
    ]

    if (startAt) {
      query.push(startAt);
    }

    const poolDocuments = await this.sdk.documents.query(...query);

    const pools = poolDocuments.map((poolDocument) => Pool.fromDocument(poolDocument));

    let nextStartAt = null
    if (poolDocuments.length === 0) {
      nextStartAt = poolDocuments[poolDocuments.length - 1].id.base58();
    }

    return { pools, nextStartAt }
  }

}

export default PoolRepository;
