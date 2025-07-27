import BaseCommand from "../../BaseCommand.js";
import joinPoolAction from "../../../actions/joinPoolAction.js";

class JoinPoolCommand extends BaseCommand {
  constructor() {
    super("join");
    this.description("Join to the Pool")
      .argument('<poolId>', 'ID of the pool')
      .argument('<utxoAddress>', 'The address of the utxo')
      .argument('<utxoHash>', 'The hash of the utxo')
      .argument('<utxoIndex>', 'The index of the utxo')
      .argument('<collateralPublicKey>', 'The owner public key for multisig wallet')
      .argument('<ownerPublicKey>', 'The owner public key for multisig wallet')
      .argument('<voterPublicKey>', 'The owner public key for multisig wallet')
      .argument('<payOutPublicKey>', 'The owner public key for multisig wallet')
      .action(joinPoolAction);
  }
}

export default JoinPoolCommand;
