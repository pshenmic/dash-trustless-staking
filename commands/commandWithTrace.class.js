import { Command } from 'commander';

class CommandWithTrace extends Command {
  constructor(name) {
    super(name);
    this.option('-t, --trace', 'Display extra information when running the command');
  }

  inspectCommand() {
    console.log(`Called '${this.name()}' with options: %o`, this.opts());
    if (this.args && this.args.length > 0) {
      console.log(`Args: ${this.args.join(', ')}`);
    }
  }

  action(fn) {
    return super.action((...args) => {
      if (this.opts().trace) {
        this.inspectCommand();
      }
      fn(...args);
    });
  }
}

export default CommandWithTrace;
