import Transaction from "@dashevo/dashcore-lib/lib/transaction/transaction.js"
import getUTXOsByAddress from "./getUTXOsByAddress.js";

// const txHash = 'c36fee02bc4f3d9b0b450ff6eddf5ebfba43158d241b6c7bc4aa709c70d5f364'


async function retrieveUtxo(sdk, txHash, vout) {
  const network = sdk.options.network;

  const dapiClient = sdk.getDAPIClient();

  let tx;

  try {
    const {transaction: rawTransaction} = await dapiClient.core.getTransaction(txHash);
    tx = new Transaction(rawTransaction.toString('hex'));
  } catch {
    await sdk.disconnect();
    console.log(false);
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

// const sdk = initSdk();
// const txHash = 'c36fee02bc4f3d9b0b450ff6eddf5ebfba43158d241b6c7bc4aa709c70d5f364'
// const vout = 1
//
// retrieveUtxo(sdk, txHash, vout)

export default retrieveUtxo;
