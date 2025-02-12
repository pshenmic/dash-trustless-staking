import CommandWithTrace from './commandWithTrace.class.js';
import topUpIdentityAction from "../actions/topUpIdentity.action.js";

class TopUpIdentityCommand extends CommandWithTrace {
  constructor(name, sdk) {
    super(name);
    this.description("Make TopUp Identity balance")
      .argument('<amount>', 'Amount credits for TopUp Identity balance')
      .action(topUpIdentityAction(sdk));
  }
}

export default TopUpIdentityCommand;
