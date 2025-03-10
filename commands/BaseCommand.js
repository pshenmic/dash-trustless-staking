import { Command } from 'commander';
import logger from "../logger.js";
import errorHandler from "../errorHandler.js";
import initSdk from "../initSdk.js";

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
      const sdk = await initSdk();
      if (this.opts().trace) {
        this.inspectCommand();
      }

      try {
        await fn(sdk, ...args);
      } catch (error) {
        errorHandler(error);
      } finally {
        await sdk.disconnect();
      }
    });
  }
}

export default BaseCommand;
