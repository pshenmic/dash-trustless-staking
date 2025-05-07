import BaseCommand from "../BaseCommand.js";
import GetActionProposalByIdCommand from "./subcommand/GetActionProposalByIdCommand.js";
import GetActionProposalByPoolIdCommand from "./subcommand/GetActionProposalByPoolIdCommand.js";
import CreateActionProposalCommand from "./subcommand/CreateActionProposalCommand.js";

const getByIdCommand = new GetActionProposalByIdCommand();
const listByPoolCommand = new GetActionProposalByPoolIdCommand();
const createProposalCommand = new CreateActionProposalCommand();

class ActionProposalCommand extends BaseCommand {
  constructor() {
    super("proposal");
    this.description("Commands to manage action proposals")
      .addCommand(getByIdCommand)
      .addCommand(listByPoolCommand)
      .addCommand(createProposalCommand);
  }
}

export default ActionProposalCommand;
