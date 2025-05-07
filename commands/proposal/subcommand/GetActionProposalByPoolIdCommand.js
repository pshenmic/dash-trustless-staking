import BaseCommand from "../../BaseCommand.js";
import getActionProposalByPoolIdAction from "../../../actions/getActionProposalByPoolIdAction.js";

class GetActionProposalByPoolIdCommand extends BaseCommand {
  constructor() {
    super("list");
    this.description("List all action proposals created by the pool owner for a specific pool")
      .argument('<poolId>', 'The ID of the pool')
      .action(getActionProposalByPoolIdAction);
  }
}

export default GetActionProposalByPoolIdCommand;
