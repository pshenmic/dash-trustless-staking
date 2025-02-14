import dotenv from 'dotenv'; dotenv.config();
import fs from "fs";

import { program } from 'commander';
import CreatePoolCommand from './commands/CreatePoolCommand.js';
import TopUpIdentityCommand from "./commands/TopUpIdentityCommand.js";

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

program
  .version(packageJson.version)
  .description(packageJson.description);

const createPoolCommand = new CreatePoolCommand()
const topUpIdentityCommand = new TopUpIdentityCommand()

program.addCommand(createPoolCommand);
program.addCommand(topUpIdentityCommand);

program.parse(process.argv);
