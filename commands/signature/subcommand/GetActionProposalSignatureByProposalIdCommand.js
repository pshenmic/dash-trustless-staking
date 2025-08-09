import BaseCommand from "../../BaseCommand.js";
import getActionProposalSignatureByProposalIdAction from "../../../actions/getActionProposalSignatureByProposalIdAction.js";

class GetActionProposalSignatureByProposalIdCommand extends BaseCommand {
  constructor() {
    super("list");
    this.description("List all signatures for a given proposal")
      .argument('<proposalId>', 'The ID of the action proposal')
      .action(getActionProposalSignatureByProposalIdAction);
  }
}

export default GetActionProposalSignatureByProposalIdCommand;
