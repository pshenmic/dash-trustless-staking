import dotenv from 'dotenv'; dotenv.config();

const config = {
  identity: process.env.IDENTITY,
  mnemonic: process.env.MNEMONIC,
}

export default config;
