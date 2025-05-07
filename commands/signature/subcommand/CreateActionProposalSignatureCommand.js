import BaseCommand from "../../BaseCommand.js";
import createActionProposalSignatureAction from "../../../actions/createActionProposalSignatureAction.js";

class CreateActionProposalSignatureCommand extends BaseCommand {
  constructor() {
    super("create");
    this.description("Create a new signature for an action proposal")
      .argument('<proposalId>', 'The ID of the action proposal')
      .argument('<signature>', "Member's signature string")
      .action(createActionProposalSignatureAction);
  }
}

export default CreateActionProposalSignatureCommand;
