import BaseCommand from "../BaseCommand.js";
import CreatePoolCommand from "./subcommand/CreatePoolCommand.js";
import GetPoolCommand from "./subcommand/GetPoolCommand.js";

const createPoolCommand = new CreatePoolCommand()
const getPoolCommand = new GetPoolCommand()

class PoolCommand extends BaseCommand {
  constructor() {
    super("pool");
    this.description("Command to interact with pool")
      .addCommand(createPoolCommand)
      .addCommand(getPoolCommand)
  }
}

export default PoolCommand;
