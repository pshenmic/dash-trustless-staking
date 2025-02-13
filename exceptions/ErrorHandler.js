import { program } from 'commander';

class ErrorHandler {
  handle(error) {
    program.error(error);
  }
}

export default ErrorHandler;
