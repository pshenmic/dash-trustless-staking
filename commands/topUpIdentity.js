import CommandWithTrace from './commandWithTrace.class.js';
import topUpIdentityAction from "../actions/topUpIdentity.action.js";
import initClient from "../initClient.js";
import topUpIdentityActionFactory from "../actions/topUpIdentity.action.js";

class TopUpIdentity extends CommandWithTrace {
  constructor(name) {
    super(name);
    this.description("Make TopUp Identity balance")
      .argument('<amount>', 'Amount credits for TopUp Identity balance')
      .action(topUpIdentityActionFactory(initClient));
  }
}

export default TopUpIdentity;
