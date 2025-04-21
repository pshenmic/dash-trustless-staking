import BaseCommand from "../../BaseCommand.js";
import listPoolAction from "../../../actions/listPoolAction.js";

class ListPoolCommand extends BaseCommand {
  constructor() {
    super("list");
    this.description("Get Pool list")
      .argument('<limit>', 'How many documents (pools) should be returned per request')
      .argument('[startAt]', 'The ID of the last document received in the previous request (optional)')
      .action(listPoolAction);
  }
}

export default ListPoolCommand;
