class CreatePoolCommand extends commander.Command {
  createCommand(name) {
    const cmd = new CommandWithTrace(name);
    // Add an option to subcommands created using `.command()`
    cmd.option('-t, --trace', 'display extra information when run command');
    return cmd;
  }
}

function inspectCommand(command) {
  // The option value is stored as property on command because we called .storeOptionsAsProperties()
  console.log(`Called '${command.name()}'`);
  console.log(`args: ${command.args}`);
  console.log('opts: %o', command.opts());
}

const program = new CommandWithTrace('program')
  .option('-v, ---verbose')
  .action((options, command) => {
    inspectCommand(command);
  });

program
  .command('serve [params...]')
  .option('-p, --port <number>', 'port number')
  .action((params, options, command) => {
    inspectCommand(command);
  });

program.command('build <target>').action((buildTarget, options, command) => {
  inspectCommand(command);
});

program.parse();
