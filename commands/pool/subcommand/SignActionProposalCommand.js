import BaseCommand from "../../BaseCommand.js";
import getPoolByIdAction from "../../../actions/getPoolByIdAction.js";
import signActionProposalAction from "../../../actions/signActionProposalAction.js";

class SignActionProposalCommand extends BaseCommand {
  constructor() {
    super("sign-proposal");
    this.description("Sign an existing action proposal (extract signatures only)")
        .argument("<proposalId>", "ID of the action proposal")
        .action(signActionProposalAction);
  }
}

export default SignActionProposalCommand;
