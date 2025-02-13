import BaseCommand from './BaseCommand.js';
import createPoolAction from '../actions/createPoolAction.js'
import MasternodeTypeEnum from "../models/enums/MasternodeTypeEnum.js";

class CreatePoolCommand extends BaseCommand {
  constructor(sdk) {
    super("createPool");
    this.description("Create Pool")
      .argument('<name>', 'The name of the pool')
      .argument('<description>', 'The description of the pool')
      .argument('<type>', `The type of the pool (${Object.values(MasternodeTypeEnum).join(", ")})`)
      .action(createPoolAction(sdk));
  }
}

export default CreatePoolCommand;
