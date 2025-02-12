import StatusEnum from "./enums/poolStatusEnum.js";
import TypeEnum from "./enums/poolTypeEnum.js";

/**
 * Class representing a Pool.
 */
class Pool {
  /**
   * Creates an instance of Pool.
   *
   * @param {string} name - The name of the pool.
   * @param {string} description - The description of the pool.
   * @param {TypeEnum} type - The type of the pool ("MASTERNODE" or "EVONODE").
   * @param {StatusEnum} status - The status of the pool ("ACTIVE", "INACTIVE", or "FILLED").
   * @param {string|null} createdAt - The creation date.
   * @param {string|null} updatedAt - The update date.
   */
  constructor(name, description, type, status, createdAt = undefined, updatedAt = undefined) {
    this.name = name;
    this.description = description;
    this.type = type;
    this.status = status;
    this.createdAt = createdAt ?? null;
    this.updatedAt = updatedAt ?? null;
  }
}

export default Pool;
