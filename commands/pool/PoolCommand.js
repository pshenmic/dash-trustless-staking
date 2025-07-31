import BaseCommand from "../BaseCommand.js";
import CreatePoolCommand from "./subcommand/CreatePoolCommand.js";
import GetPoolCommand from "./subcommand/GetPoolCommand.js";
import JoinPoolCommand from "./subcommand/JoinPoolCommand.js";
import ListPoolCommand from "./subcommand/ListPoolCommand.js";
import SendPoolMessageCommand from "./subcommand/SendPoolMessageCommand.js";
import FinalizePoolCommand from "./subcommand/FinalizePoolCommand.js";

const createPoolCommand = new CreatePoolCommand()
const getPoolCommand = new GetPoolCommand()
const joinPoolCommand = new JoinPoolCommand()
const listPoolCommand = new ListPoolCommand()
const sendPoolMessageCommand = new SendPoolMessageCommand()
const finalizePoolCommand = new FinalizePoolCommand()

class PoolCommand extends BaseCommand {
  constructor() {
    super("pool");
    this.description("Command to interact with pool")
      .addCommand(createPoolCommand)
      .addCommand(getPoolCommand)
      .addCommand(joinPoolCommand)
      .addCommand(listPoolCommand)
      .addCommand(sendPoolMessageCommand)
      .addCommand(finalizePoolCommand)
  }
}

export default PoolCommand;
