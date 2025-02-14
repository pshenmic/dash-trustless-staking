import { Command } from 'commander';
import logger from "../logger.js";
import errorHandler from "../errorHandler.js";

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
        errorHandler(error);
      }
    });
  }
}

export default BaseCommand;
