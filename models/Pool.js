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
   * @param {string} name - The name of the pool.
   * @param {string} description - The description of the pool.
   * @param {MasternodeTypeEnum} type - The type of the pool ("MASTERNODE" or "EVONODE").
   * @param {PoolStatusEnum} status - The status of the pool ("ACTIVE", "INACTIVE", or "FILLED").
   * @param {string=} createdAt - The creation date.
   * @param {string=} updatedAt - The update date.
   */
  constructor(name, description, type, status, createdAt = undefined, updatedAt = undefined) {
    this.name = name;
    this.description = description;
    this.type = type;
    this.status = status;
    this.createdAt = createdAt ?? null;
    this.updatedAt = updatedAt ?? null;
  }

  static fromDocument(appData) {
    appData = appData.toJSON();
    return new Pool(
      appData.name,
      appData.description,
      appData.type,
      appData.status,
      appData['$createdAt'],
      appData['$updatedAt'],
    )
  }
}

export default Pool;
