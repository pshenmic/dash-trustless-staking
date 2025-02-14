import MasternodeTypeEnum from "../models/enums/MasternodeTypeEnum.js";

class InvalidPoolTypeError extends Error {
  constructor() {
    const validTypes = Object.values(MasternodeTypeEnum).join(', ');
    super(`Invalid pool type. Valid types are: ${validTypes}`);
    this.name = 'InvalidPoolTypeError';
  }
}

export default InvalidPoolTypeError;
