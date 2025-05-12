import BaseCommand from "../../BaseCommand.js";
import getActionProposalByIdAction from "../../../actions/getActionProposalByIdAction.js";

class GetActionProposalByIdCommand extends BaseCommand {
  constructor() {
    super("get");
    this.description("Get an action proposal by its ID")
      .argument('<proposalId>', 'The ID of the action proposal')
      .action(getActionProposalByIdAction);
  }
}

export default GetActionProposalByIdCommand;
