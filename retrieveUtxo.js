import Transaction from "@dashevo/dashcore-lib/lib/transaction/transaction.js"
import getUTXOsByAddress from "./getUTXOsByAddress.js";

async function retrieveUtxo(sdk, txHash, vout) {
  const network = sdk.options.network;

  const dapiClient = sdk.getDAPIClient();

  let tx;

  try {
    const {transaction: rawTransaction} = await dapiClient.core.getTransaction(txHash);
    tx = new Transaction(rawTransaction.toString('hex'));
  } catch {
    await sdk.disconnect();
    return null;
  }

  const address = tx.outputs[vout].script.toAddress(network).toString();

  const utxos = await getUTXOsByAddress([address]);

  const [utxo] = utxos.filter((utxo) => utxo.txHash === txHash && utxo.vout === vout);

  if (!utxo) {
    return null;
  }

  return utxo
}

export default retrieveUtxo;
