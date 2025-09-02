import dotenv from 'dotenv'; dotenv.config();

const config = {
  network: process.env.NETWORK || "testnet",
  identity: process.env.IDENTITY,
  mnemonic: process.env.MNEMONIC,
  contractId: process.env.CONTRACT_ID,
  fee: parseInt(process.env.FEE) || 1000,
  collateralAmount: {
    "MASTERNODE": 1000e8,
    "EVONODE": 4000e8,
  }
  identityIndex: 0,
  identityKeyIndex: 1,
}

export default config;
