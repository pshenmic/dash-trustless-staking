import CommandWithTrace from './CommandWithTrace.js';
import createPoolAction from '../actions/createPoolAction.js'
import poolTypeEnum from "../models/enums/poolTypeEnum.js";

class CreatePoolCommand extends CommandWithTrace {
  constructor(name, sdk) {
    super(name);
    this.description("Create Pool")
      .argument('<name>', 'The name of the pool')
      .argument('<description>', 'The description of the pool')
      .argument('<type>', `The type of the pool (${Object.values(poolTypeEnum).join(", ")})`)
      .action(createPoolAction(sdk));
  }
}

export default CreatePoolCommand;
