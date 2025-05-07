import BaseCommand from "../../BaseCommand.js";
import createActionProposalAction from "../../../actions/createActionProposalAction.js";

class CreateActionProposalCommand extends BaseCommand {
  constructor() {
    super("create");
    this.description("Create a new action proposal for a pool")
      .argument('<poolId>', 'The ID of the pool')
      .argument('<transactionHex>', 'Unsigned multisig transaction hex')
      .argument('<description>', 'Human-readable description of the proposal')
      .action(createActionProposalAction);
  }
}

export default CreateActionProposalCommand;
