import BaseCommand from "../../BaseCommand.js";
import getPoolByIdAction from "../../../actions/getPoolByIdAction.js";

class GetPoolCommand extends BaseCommand {
  constructor() {
    super("get");
    this.description("Get Pool by ID")
      .argument('<poolId>', 'The ID of the pool')
      .action(getPoolByIdAction);
  }
}

export default GetPoolCommand;
