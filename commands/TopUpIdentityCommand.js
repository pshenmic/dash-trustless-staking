import BaseCommand from './BaseCommand.js';
import topUpIdentityAction from "../actions/topUpIdentityAction.js";

class TopUpIdentityCommand extends BaseCommand {
  constructor(name, sdk) {
    super(name);
    this.description("Make TopUp Identity balance")
      .argument('<amount>', 'Amount credits for TopUp Identity balance')
      .action(topUpIdentityAction(sdk));
  }
}

export default TopUpIdentityCommand;
