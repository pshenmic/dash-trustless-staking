import dotenv from 'dotenv'; dotenv.config();

import { program } from 'commander';
import CreatePool from './commands/createPool.js';
import TopUpIdentity from "./commands/topUpIdentity.js";

program
  .version('1.0.0')
  .description('Commander App');

program.addCommand(new CreatePool('createPool'));
program.addCommand(new TopUpIdentity('topUpIdentity'));

program.parse(process.argv);
