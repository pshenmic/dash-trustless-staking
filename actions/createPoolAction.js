import logger from "../logger.js";
import Pool from "../models/Pool.js";
import {pushDocument} from "../utils.js";
import PoolStatusEnum from "../models/enums/PoolStatusEnum.js";
import MasternodeTypeEnum from "../models/enums/MasternodeTypeEnum.js";
import initSdk from "../initSdk.js";
import InvalidPoolTypeError from "../errors/InvalidPoolTypeError.js";

const createPoolAction = () => {
  return async (name, description, type) => {
    const sdk = initSdk();

    const status = PoolStatusEnum.INACTIVE;

    if (!Object.values(MasternodeTypeEnum).includes(type)) {
      throw new InvalidPoolTypeError();
    }

    const pool = new Pool(name, description, type, status);

    logger.info(`Creating pool:
      Name: ${pool.name}
      Description: ${pool.description}
      Type: ${pool.type}
      Status: ${pool.status}
    `);

    const docName = 'pool';

    await pushDocument(sdk, docName, pool);

    await sdk.disconnect();
  };
};

export default createPoolAction;
