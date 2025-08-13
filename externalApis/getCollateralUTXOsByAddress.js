import UtxoNotFoundError from "../errors/UtxoNotFoundError.js";
import Collateral from "../models/Collateral.js";
import { getInsightUtxosByAddresses } from "../utils/insightUtxoClient.js";

/**
 * Возвращает массив Collateral для адресов через Insight.
 * @param {string[]|string} addresses
 * @returns {Promise<Collateral[]>}
 */
async function getCollateralUTXOsByAddress(addresses) {
  const list = Array.isArray(addresses) ? addresses : [addresses];

  // при необходимости можно прокинуть { baseUrl, paths, timeoutMs, noCache }
  const utxos = await getInsightUtxosByAddresses(list);

  if (!utxos.length) {
    throw new UtxoNotFoundError();
  }

  return utxos.map((u) => Collateral.fromDocument(u));
}

export default getCollateralUTXOsByAddress;
