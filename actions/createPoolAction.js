import Pool from "../models/Pool.js";
import PoolStatusEnum from "../models/enums/PoolStatusEnum.js";
import MasternodeTypeEnum from "../models/enums/MasternodeTypeEnum.js";
import initSdk from "../initSdk.js";
import InvalidPoolTypeError from "../errors/InvalidPoolTypeError.js";
import PoolRepository from "../repositories/PoolRepository.js";

const createPoolAction = () => {
  return async (name, description, type) => {
    const sdk = initSdk();

    const poolRepository = new PoolRepository(sdk);

    const status = PoolStatusEnum.INACTIVE;

    if (!(type in MasternodeTypeEnum)) {
      throw new InvalidPoolTypeError();
    }

    const pool = new Pool(name, description, type, status);

    await poolRepository.create(pool);

    await sdk.disconnect();
  };
};

export default createPoolAction;
