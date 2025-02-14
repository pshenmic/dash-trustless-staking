import {program} from "commander";
import InvalidPoolTypeError from "./errors/InvalidPoolTypeError.js";
import InvalidTopUpAmountError from "./errors/InvalidTopUpAmountError.js";

function errorHandler(error) {
  if (error instanceof InvalidPoolTypeError) {
    program.error(error.message);
  } else if (error instanceof InvalidTopUpAmountError) {
    program.error(error.message);
  } else {
    program.error(error);
  }
}

export default errorHandler;
