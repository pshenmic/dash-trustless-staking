import BaseCommand from "../BaseCommand.js";
import TopUpIdentityCommand from "./subcommands/TopUpIdentityCommand.js";

const topUpIdentityCommand = new TopUpIdentityCommand();

class IdentityCommand extends BaseCommand {
  constructor() {
    super("identity");
    this.description("Command to interact with identity")
      .addCommand(topUpIdentityCommand)
  }
}

export default IdentityCommand;
