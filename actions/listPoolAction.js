import logger from "../logger.js";
import PoolRepository from "../repositories/PoolRepository.js";
import UtxoRepository from "../repositories/UtxoRepository.js";

/**
 * @param {Client} sdk
 * @returns {function(string, number): Promise<Pool>}
 */
const listPoolAction = (sdk) => {
  return async (startAt, limit) => {
    const poolRepository = new PoolRepository(sdk);
    const utxoRepository = new UtxoRepository(sdk);


  }
}

export default listPoolAction;
