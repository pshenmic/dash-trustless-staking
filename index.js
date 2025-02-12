import dotenv from 'dotenv'; dotenv.config();
import fs from "fs";

import { program } from 'commander';
import CreatePoolCommand from './commands/CreatePoolCommand.js';
import TopUpIdentityCommand from "./commands/TopUpIdentityCommand.js";
import initSdk from "./initSdk.js";

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

program
  .version(packageJson.version)
  .description(packageJson.description);

const sdk = initSdk()

const createPoolCommand = new CreatePoolCommand('createPool', sdk)
const topUpIdentityCommand = new TopUpIdentityCommand('topUpIdentity', sdk)

program.addCommand(createPoolCommand);
program.addCommand(topUpIdentityCommand);

program.parse(process.argv);
