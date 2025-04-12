#!/usr/bin/env node
import dotenv from 'dotenv'; dotenv.config();
import fs from "fs";

import { program } from 'commander';
import PoolCommand from "./commands/pool/PoolCommand.js";
import IdentityCommand from "./commands/identity/IdentityCommand.js";

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

program
  .version(packageJson.version)
  .description(packageJson.description);

const poolCommands = new PoolCommand()
const identityCommands = new IdentityCommand()

program.addCommand(poolCommands);
program.addCommand(identityCommands);

program.parse(process.argv);
