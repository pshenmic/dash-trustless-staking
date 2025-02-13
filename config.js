import dotenv from 'dotenv'; dotenv.config();

const config = {
  identity: process.env.IDENTITY,
  mnemonic: process.env.MNEMONIC,
  skipSynchronizationBeforeHeight: Number(process.env.SKIP_SYNCHRONIZATION_BEFORE_HEIGHT),
}

export default config;
