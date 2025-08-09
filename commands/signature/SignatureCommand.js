import BaseCommand from "../BaseCommand.js";
import GetActionProposalSignatureByProposalIdCommand from "./subcommand/GetActionProposalSignatureByProposalIdCommand.js";
import GetActionProposalSignatureByIdCommand from "./subcommand/GetActionProposalSignatureByIdCommand.js";
import CreateActionProposalSignatureCommand from "./subcommand/CreateActionProposalSignatureCommand.js";

const listByProposalCommand = new GetActionProposalSignatureByProposalIdCommand();
const getByIdCommand = new GetActionProposalSignatureByIdCommand();
const createSignatureCommand = new CreateActionProposalSignatureCommand();

class SignatureCommand extends BaseCommand {
  constructor() {
    super("signature");
    this.description("Commands to manage action proposal signatures")
      .addCommand(listByProposalCommand)
      .addCommand(getByIdCommand)
      .addCommand(createSignatureCommand);
  }
}

export default SignatureCommand;
