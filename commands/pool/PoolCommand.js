import BaseCommand from "../BaseCommand.js";
import CreatePoolCommand from "./subcommand/CreatePoolCommand.js";

const createPoolCommand = new CreatePoolCommand()

class PoolCommand extends BaseCommand {
  constructor() {
    super("pool");
    this.description("Command to interact with pool")
      .addCommand(createPoolCommand)
  }
}

export default PoolCommand;
