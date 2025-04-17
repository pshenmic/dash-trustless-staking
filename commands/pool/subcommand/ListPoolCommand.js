import BaseCommand from "../../BaseCommand.js";
import getPoolByIdAction from "../../../actions/getPoolByIdAction.js";

class ListPoolCommand extends BaseCommand {
  constructor() {
    super("list");
    this.description("Get Pool list")
      .argument('<startAt>', 'The ID the last document received in the previous request')
      .argument('<limit>', 'How many documents (pools) should be returned per request')
      .action(getPoolByIdAction);
  }
}

export default ListPoolCommand;
