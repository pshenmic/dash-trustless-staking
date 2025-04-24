import BaseCommand from "../../BaseCommand.js";
import sendPoolMessageAction from "../../../actions/sendPoolMessageAction.js";

class SendPoolMessageCommand extends BaseCommand {
  constructor() {
    super("message");
    this.description("Send a message to the pool chat")
      .argument('<poolId>', 'ID of the pool')
      .argument('<text>', 'Message text')
      .action(sendPoolMessageAction);
  }
}

export default SendPoolMessageCommand;
