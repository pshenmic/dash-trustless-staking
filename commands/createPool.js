import CommandWithTrace from './commandWithTrace.class.js';
import createPoolAction from '../actions/createPool.action.js'

class CreatePool extends CommandWithTrace {
  constructor(name) {
    super(name);
    this.description("Create Pool")
      .argument('<name>', 'The name of the pool')  // Позиционный аргумент для имени
      .argument('<description>', 'The description of the pool')  // Позиционный аргумент для описания
      .argument('<type>', 'The type of the pool (MASTERNODE or EVONODE)')  // Позиционный аргумент для типа
      .action(createPoolAction);
  }
}

export default CreatePool;
