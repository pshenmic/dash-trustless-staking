import BaseCommand from './BaseCommand.js';
import initAction from '../actions/initAction.js';

class InitCommand extends BaseCommand {
  constructor() {
    super('init');
    this
      .description('Initialize project with a BIP39 mnemonic (stores it locally for future use)')
      // Accepts a variable-length mnemonic: pool init "word1 word2 ... word12"
      .argument('<mnemonic...>', 'Mnemonic phrase (BIP39)')
      .action(initAction);
  }
}

export default InitCommand;