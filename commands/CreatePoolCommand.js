import CommandWithTrace from './commandWithTrace.class.js';
import createPoolAction from '../actions/createPool.action.js'

class CreatePoolCommand extends CommandWithTrace {
  constructor(name, sdk) {
    super(name);
    this.description("Create Pool")
      .argument('<name>', 'The name of the pool')  // Позиционный аргумент для имени
      .argument('<description>', 'The description of the pool')  // Позиционный аргумент для описания
      .argument('<type>', 'The type of the pool (MASTERNODE or EVONODE)')  // Позиционный аргумент для типа
      .action(createPoolAction(sdk));
  }
}

export default CreatePoolCommand;
