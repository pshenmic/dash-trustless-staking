import dotenv from 'dotenv'; dotenv.config();

const config = {
  network: process.env.NETWORK || "testnet",
  identity: process.env.IDENTITY,
  mnemonic: process.env.MNEMONIC,
  contractId: process.env.CONTRACT_ID,
}

export default config;
