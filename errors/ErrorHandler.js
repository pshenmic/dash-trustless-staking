import { program } from 'commander';
import InvalidPoolTypeError from "./InvalidPoolTypeError.js";
import InvalidTopUpAmountError from "./InvalidTopUpAmountError.js";

class ErrorHandler {
  handle(error) {
    if (error instanceof InvalidPoolTypeError) {
      program.error(error.message);
    } else if (error instanceof InvalidTopUpAmountError) {
      program.error(error.message);
    } else {
      program.error(error);
    }
  }
}

export default ErrorHandler;
