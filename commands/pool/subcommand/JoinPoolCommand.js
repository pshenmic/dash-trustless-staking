import BaseCommand from "../../BaseCommand.js";
import joinPoolAction from "../../../actions/joinPoolAction.js";

class JoinPoolCommand extends BaseCommand {
  constructor() {
    super("join");
    this.description("Join to the Pool")
      .argument('<poolId>', 'ID of the pool')
      .argument('<utxoHash>', 'The hash of the utxo')
      .argument('<utxoIndex>', 'The index of the utxo')
      .action(joinPoolAction);
  }
}

export default JoinPoolCommand;
