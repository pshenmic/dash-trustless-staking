import Transaction from "@dashevo/dashcore-lib/lib/transaction/transaction.js"
import getUTXOsByAddress from "../externalApis/getUTXOsByAddress.js";

async function fetchUtxoByTxHashAndVout(sdk, txHash, vout) {
  const network = sdk.options.network;

  const dapiClient = sdk.getDAPIClient();

  const {transaction: rawTransaction} = await dapiClient.core.getTransaction(txHash);

  const tx = new Transaction(rawTransaction.toString('hex'));

  const address = tx.outputs[vout].script.toAddress(network).toString();

  const utxos = await getUTXOsByAddress([address]);

  const [utxo] = utxos.filter((utxo) => utxo.txHash === txHash && utxo.vout === vout);

  if (!utxo) {
    return null;
  }

  return utxo
}

export default fetchUtxoByTxHashAndVout;
