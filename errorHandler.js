import {program} from "commander";
import InvalidPoolTypeError from "./errors/InvalidPoolTypeError.js";
import InvalidTopUpAmountError from "./errors/InvalidTopUpAmountError.js";
import PoolNotFoundError from "./errors/PoolNotFoundError.js";
import UtxoNotFoundError from "./errors/UtxoNotFoundError.js";

/**
 * @param {Error} error
 */
function errorHandler(error) {
  if (error instanceof InvalidPoolTypeError) {
    program.error(error.message);
  } else if (error instanceof InvalidTopUpAmountError) {
    program.error(error.message);
  } else if (error instanceof PoolNotFoundError) {
    program.error(error.message);
  } else if (error instanceof UtxoNotFoundError) {
    program.error(error.message);
  } else {
    throw error;
  }
}

export default errorHandler;
