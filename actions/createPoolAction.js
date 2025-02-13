import logger from "../logger.js";
import Pool from "../models/Pool.js";
import {pushDocument} from "../utils.js";
import PoolStatusEnum from "../models/enums/PoolStatusEnum.js";
import MasternodeTypeEnum from "../models/enums/MasternodeTypeEnum.js";
import config from "../config.js";

const createPoolAction = (sdk) => {
  return async (name, description, type) => {
    let result = false;
    try {
      const status = PoolStatusEnum.INACTIVE;

      if (!Object.values(MasternodeTypeEnum).includes(type)) {
        logger.error(
          "Invalid pool type. Valid types are",
          Object.values(MasternodeTypeEnum).join(", ")
        );
        return result;
      }

      const pool = new Pool(name, description, type, status);

      logger.log(`Creating pool:
        Name: ${pool.name}
        Description: ${pool.description}
        Type: ${pool.type}
        Status: ${pool.status}
      `);

      const docName = 'pools';

      await pushDocument(sdk, docName, pool);

      result = true;
    } catch (e) {
      logger.error(e);
    } finally {
      sdk.disconnect();
    }
    return result;
  };
};

export default createPoolAction;
