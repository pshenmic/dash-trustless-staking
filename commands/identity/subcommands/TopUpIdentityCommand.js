import BaseCommand from '../../BaseCommand.js';
import topUpIdentityAction from "../../../actions/topUpIdentityAction.js";

class TopUpIdentityCommand extends BaseCommand {
  constructor() {
    super('topup');
    this.description("Make TopUp Identity balance")
      .argument('<amount>', 'Amount credits for TopUp Identity balance')
      .action(topUpIdentityAction());
  }
}

export default TopUpIdentityCommand;
