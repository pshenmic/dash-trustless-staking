import dotenv from 'dotenv'; dotenv.config();
import fs from "fs";

import { program } from 'commander';
import CreatePoolCommand from './commands/createPoolCommand.js';
import TopUpIdentityCommand from "./commands/topUpIdentityCommand.js";
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
