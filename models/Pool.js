import PoolStatusEnum from "./enums/PoolStatusEnum.js";
import MasternodeTypeEnum from "./enums/MasternodeTypeEnum.js";
import logger from "../logger.js";

/**
 * Class representing a Pool.
 */
class Pool {
  /**
   * Creates an instance of Pool.
   *
   * @param {string | null} id - The id of the pool.
   * @param {string | null} ownerId - The id owner of the pool.
   * @param {string} name - The name of the pool.
   * @param {string} description - The description of the pool.
   * @param {MasternodeTypeEnum} type - The type of the pool ("MASTERNODE" or "EVONODE").
   * @param {PoolStatusEnum} status - The status of the pool ("ACTIVE", "INACTIVE", or "FILLED").
   * @param {string | null} blsPublicKey - BLS Public Key
   * @param {string=} createdAt - The creation date.
   * @param {string=} updatedAt - The update date.
   */
  constructor(id = null, name, description, type, status, blsPublicKey, ownerId = null, createdAt = undefined, updatedAt = undefined) {
    this.id = id;
    this.ownerId = ownerId;
    this.name = name;
    this.description = description;
    this.type = type;
    this.status = status;
    this.blsPublicKey = blsPublicKey;
    this.createdAt = createdAt ?? null;
    this.updatedAt = updatedAt ?? null;
  }

  static fromDocument(appData) {
    return new Pool(
      appData.id.base58(),
      appData.properties.name,
      appData.properties.description,
      appData.properties.type,
      appData.properties.status,
      appData.properties.blsPublicKey,
      appData.ownerId.base58(),
      appData.createdAt?.toString() ?? String(Date.now()),
      appData.updatedAt?.toString() ?? String(Date.now()),
    )
  }
}

export default Pool;
