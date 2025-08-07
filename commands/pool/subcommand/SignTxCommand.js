import BaseCommand from "../../BaseCommand.js";
import getPoolByIdAction from "../../../actions/getPoolByIdAction.js";
import signActionProposalAction from "../../../actions/signActionProposalAction.js";
import signTxAction from "../../../actions/signTxAction.js";

class SignTxCommand extends BaseCommand {
  constructor() {
    super("sign-tx");
    this.description("Verify the complete presence of signatures and sign the transaction.")
        .argument("<proposalId>", "ID of the action proposal")
        .action(signTxAction);
  }
}

export default SignTxCommand;
