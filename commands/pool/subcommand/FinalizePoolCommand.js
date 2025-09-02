import BaseCommand from "../../BaseCommand.js";
import finalizePoolAction from "../../../actions/finalizePoolAction.js";

class FinalizePoolCommand extends BaseCommand {
  constructor() {
    super("finalize");
    this.description("Finalize Pool. Create action proposal.")
      .argument('<poolId>', 'ID of the pool')
      .argument('<description>', 'Description of the proposal')
      .action(finalizePoolAction);
  }
}

export default FinalizePoolCommand;
