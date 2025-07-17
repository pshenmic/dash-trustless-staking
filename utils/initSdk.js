import { DashPlatformSDK } from 'dash-platform-sdk';
import config from '../config.js';
import logger from '../logger.js';

/**
 * Initialize and return a Dash Platform SDK instance.
 *
 * @returns {DashPlatformSDK}
 */
export default function initSdk() {
  const network = config.network || 'testnet';
  logger.log(`⚙️  Using Dash Platform SDK on network: ${network}`);

  // Create a new DashPlatformSDK instance
  const sdk = new DashPlatformSDK({
    network,
  });

  if (!config.contractId) {
    throw new Error("Missing SDK.contractId – set CONTRACT_ID in your env or config");
  }

  logger.log(`📄 Loaded Data Contract ID: ${config.contractId}`);

  if (!config.identity) {
    throw new Error("Missing SDK.ownerId – set IDENTITY in your env or config");
  }

  sdk.ownerId = config.identity;
  logger.log(`👤 Using Identity ID: ${sdk.ownerId}`);

  return sdk;
}
