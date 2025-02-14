import { program, Command } from 'commander';
import logger from "../logger.js";
import ErrorHandler from "../errors/ErrorHandler.js";

const errorHandler = new ErrorHandler();

class BaseCommand extends Command {
  constructor(name) {
    super(name);
    this.option('-t, --trace', 'Display extra information when running the command');
  }

  inspectCommand() {
    logger.log(`Called '${this.name()}' with options: %o`, this.opts());
    if (this.args && this.args.length > 0) {
      logger.log(`Args: ${this.args.join(', ')}`);
    }
  }

  action(fn) {
    return super.action(async (...args) => {
      if (this.opts().trace) {
        this.inspectCommand();
      }

      try {
        await fn(...args);
      } catch (error) {
        errorHandler.handle(error);
      }
    });
  }
}

export default BaseCommand;
