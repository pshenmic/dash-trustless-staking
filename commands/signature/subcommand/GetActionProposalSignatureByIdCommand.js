import BaseCommand from "../../BaseCommand.js";
import getActionProposalSignatureByIdAction from "../../../actions/getActionProposalSignatureByIdAction.js";

class GetActionProposalSignatureByIdCommand extends BaseCommand {
  constructor() {
    super("get");
    this.description("Get a single signature by its ID")
      .argument('<signatureId>', 'The ID of the signature')
      .action(getActionProposalSignatureByIdAction);
  }
}

export default GetActionProposalSignatureByIdCommand;
