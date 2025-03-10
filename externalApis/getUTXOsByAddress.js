import UtxoNotFoundError from "../errors/UtxoNotFoundError.js";
import Utxo from "../models/Utxo.js";

/**
 * @param {[string]} addresses
 * @returns {Promise<[Utxo]>}
 */
async function getUTXOsByAddress(addresses) {
  // Base URL for the indexer API
  const baseUrl = "https://trpc.digitalcash.dev/";

  // Basic authentication: replace "user:pass" with your actual credentials
  const basicAuth = Buffer.from("user:pass").toString("base64");

  // Prepare the request payload
  const payload = JSON.stringify({
    method: "getaddressutxos",
    params: [
      {
        addresses: addresses
      }
    ]
  });

  // Execute the POST request to the indexer
  const resp = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/json"
    },
    body: payload
  });

  // Parse JSON response
  const data = await resp.json();

  // Throw error if the indexer returns an error
  if (data.error) {
    let err = new Error(data.error.message);
    Object.assign(err, data.error);
    throw err;
  }

  if (!data.result.length) {
    throw new UtxoNotFoundError();
  }

  // Return the UTXOs array
  return data.result.map((utxo) => Utxo.fromObject(utxo));
}

export default getUTXOsByAddress;
