#!/usr/bin/env node
import dotenv from 'dotenv'; dotenv.config();
import fs from "fs";

import { program } from 'commander';
import PoolCommand from "./commands/pool/PoolCommand.js";
import IdentityCommand from "./commands/identity/IdentityCommand.js";
import ActionProposalCommand from "./commands/proposal/ProposalCommand.js";
import SignatureCommand from "./commands/signature/SignatureCommand.js";
import InitCommand from "./commands/InitCommand.js";

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

program
  .version(packageJson.version)
  .description(packageJson.description);

const poolCommands = new PoolCommand()
const identityCommands = new IdentityCommand()
const proposalCommands = new ActionProposalCommand()
const signatureCommands = new SignatureCommand()
const initCommand = new InitCommand()

program.addCommand(poolCommands);
program.addCommand(identityCommands);
program.addCommand(proposalCommands);
program.addCommand(signatureCommands);
program.addCommand(initCommand);

program.parse(process.argv);
