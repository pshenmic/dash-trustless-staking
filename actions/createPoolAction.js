import Pool from "../models/Pool.js";
import PoolStatusEnum from "../models/enums/PoolStatusEnum.js";
import MasternodeTypeEnum from "../models/enums/MasternodeTypeEnum.js";
import InvalidPoolTypeError from "../errors/InvalidPoolTypeError.js";
import PoolRepository from "../repositories/PoolRepository.js";
import logger from "../logger.js";
import {generateBlsKeyPair} from "../utils/blsKeyPair.js";

/**
 * @param {DashPlatformSDK} sdk
 * @returns {(function(string, string, MasternodeTypeEnum, string | null): Promise<void>)|*}
 */
//TODO: Add bls set or generate
const createPoolAction = (sdk) => {
  return async (name, description, type,bls_public_key) => {
    const poolRepository = new PoolRepository(sdk);

    const status = PoolStatusEnum.INACTIVE;

    if (!(type in MasternodeTypeEnum)) {
      throw new InvalidPoolTypeError();
    }

    const { secretKey, publicKey } = !bls_public_key ? await generateBlsKeyPair() : {};

    if (!bls_public_key) {
      bls_public_key = publicKey;
      logger.info(`
BLS PublicKey was not specified, so it was generated automatically.

###    ATTENTION! Keep secretKey and publicKey safe    ###
otherwise you will lose operator access to the created node
    `)
      logger.info({secretKey, publicKey})
    }

    const pool = new Pool(null, name, description, type, status, bls_public_key);

    await poolRepository.create(pool);
  };
};

export default createPoolAction;
