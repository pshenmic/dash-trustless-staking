import BaseCommand from "../BaseCommand.js";
import CreatePoolCommand from "./subcommand/CreatePoolCommand.js";
import GetPoolCommand from "./subcommand/GetPoolCommand.js";
import JoinPoolCommand from "./subcommand/JoinPoolCommand.js";

const createPoolCommand = new CreatePoolCommand()
const getPoolCommand = new GetPoolCommand()
const joinPoolCommand = new JoinPoolCommand()

class PoolCommand extends BaseCommand {
  constructor() {
    super("pool");
    this.description("Command to interact with pool")
      .addCommand(createPoolCommand)
      .addCommand(getPoolCommand)
      .addCommand(joinPoolCommand)
  }
}

export default PoolCommand;
