import CommandWithTrace from './CommandWithTrace.js';
import topUpIdentityAction from "../actions/topUpIdentityAction.js";

class TopUpIdentityCommand extends CommandWithTrace {
  constructor(name, sdk) {
    super(name);
    this.description("Make TopUp Identity balance")
      .argument('<amount>', 'Amount credits for TopUp Identity balance')
      .action(topUpIdentityAction(sdk));
  }
}

export default TopUpIdentityCommand;
