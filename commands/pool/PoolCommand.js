import BaseCommand from "../BaseCommand.js";
import CreatePoolCommand from "./subcommand/CreatePoolCommand.js";
import GetPoolCommand from "./subcommand/GetPoolCommand.js";
import JoinPoolCommand from "./subcommand/JoinPoolCommand.js";
import ListPoolCommand from "./subcommand/ListPoolCommand.js";

const createPoolCommand = new CreatePoolCommand()
const getPoolCommand = new GetPoolCommand()
const joinPoolCommand = new JoinPoolCommand()
const listPoolCommand = new ListPoolCommand()

class PoolCommand extends BaseCommand {
  constructor() {
    super("pool");
    this.description("Command to interact with pool")
      .addCommand(createPoolCommand)
      .addCommand(getPoolCommand)
      .addCommand(joinPoolCommand)
      .addCommand(listPoolCommand)
  }
}

export default PoolCommand;
