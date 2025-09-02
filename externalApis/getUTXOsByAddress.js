import UtxoNotFoundError from "../errors/UtxoNotFoundError.js";
import { getInsightUtxosByAddresses } from "../utils/insightUtxoClient.js";

/**
 * @param {string[]|string} addresses
 * @param {{ baseUrl?: string, paths?: string[], timeoutMs?: number, noCache?: boolean }} [opts]
 * @returns {Promise<Array<{
 *   address: string,
 *   txid: string,
 *   outputIndex: number,
 *   script: string,
 *   satoshis: number,
 *   height: number
 * }>>}
 */
async function getUTXOsByAddress(addresses, opts = {}) {
  const list = Array.isArray(addresses) ? addresses : [addresses];

  const utxos = await getInsightUtxosByAddresses(list, opts);
  if (!utxos.length) {
    throw new UtxoNotFoundError();
  }
  return utxos;
}

export default getUTXOsByAddress;
