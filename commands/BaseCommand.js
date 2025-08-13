import { Command } from 'commander';
import logger from "../logger.js";
import errorHandler from "../errorHandler.js";
import initSdk from "../utils/initSdk.js";

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

  /**
   * @param {function(Client)} action
   * @returns {Command}
   */
  action(action) {
    return super.action(async (...args) => {
      if (this.opts().trace) {
        this.inspectCommand();
      }

      const sdk = initSdk();

      const fn = action(sdk);

      try {
        await fn(...args);
      } catch (error) {
        errorHandler(error);
      } finally {
        if (sdk.disconnect) {
          await sdk.disconnect();
        }
      }
    });
  }
}

export default BaseCommand;
