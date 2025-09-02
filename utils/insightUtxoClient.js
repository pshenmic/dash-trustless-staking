const DEFAULT_BASE = "https://insight.testnet.networks.dash.org";
const DEFAULT_PATHS = ["/insight-api/addr", "/insight-api-dash/addr"];
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
async function fetchJsonWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalization of UTXO elements from Insight to a single view.
 * @param {any} u
 * @param {string} fallbackAddress
 */
function normalizeUtxo(u, fallbackAddress) {
  return {
    address: u.address || fallbackAddress,
    txid: u.txid,
    outputIndex: u.vout ?? u.outputIndex ?? 0,
    script: u.scriptPubKey || u.script || "",
    satoshis: Number(u.satoshis ?? u.amountSat ?? 0),
    height: Number(u.height ?? 0),
  };
}

/**
 * Obtain UTXO at a single address by trying several Insight paths.
 * @param {string} address
 * @param {{ baseUrl?: string, paths?: string[], timeoutMs?: number, noCache?: boolean }} [opts]
 * @returns {Promise<Array<{
 *   address: string, txid: string, outputIndex: number, script: string, satoshis: number, height: number
 * }>>}
 */
export async function getInsightUtxosByAddress(address, opts = {}) {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  const paths = opts.paths ?? DEFAULT_PATHS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const noCache = opts.noCache ?? true;

  let lastErr;
  for (const p of paths) {
    const url = `${baseUrl}${p}/${address}/utxo${noCache ? "?noCache=1" : ""}`;
    try {
      const data = await fetchJsonWithTimeout(url, timeoutMs);
      const arr = Array.isArray(data) ? data : [];
      return arr.map((u) => normalizeUtxo(u, address));
    } catch (e) {
      lastErr = new Error(`Fetch failed for ${url}: ${e.message}`);
    }
  }
  throw lastErr || new Error(`Failed to fetch UTXO for ${address}`);
}

/**
 * For multiple addresses (in parallel).
 * @param {string[]} addresses
 * @param {{ baseUrl?: string, paths?: string[], timeoutMs?: number, noCache?: boolean }} [opts]
 */
export async function getInsightUtxosByAddresses(addresses, opts = {}) {
  const lists = await Promise.all(addresses.map((a) => getInsightUtxosByAddress(a, opts)));
  return lists.flat();
}
