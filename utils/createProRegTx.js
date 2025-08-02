import dashcore from "@dashevo/dashcore-lib";
import getUTXOsByAddress from "../externalApis/getUTXOsByAddress.js";
import config from "../config.js";
import UtxoNotFoundError from "../errors/UtxoNotFoundError.js";
import InsufficientCollateralError from "../errors/InsufficientCollateralError.js";
import PublicKeyHashInput from "@dashevo/dashcore-lib/lib/transaction/input/publickeyhash.js";

const {Address, Script, Transaction} = dashcore;

/**
 * Create ProRegTx
 *
 * @param {Array<Collateral>} collateralUTXOs
 * @param {string} blsPublicKey
 * @param {MasternodeTypeEnum} poolType
 * @returns {Promise<Transaction>}
 */
export async function createProRegTx(collateralUTXOs, blsPublicKey, poolType) {

    const addresses = collateralUTXOs.map(c => c.address);
    const actualUTXOs = await getUTXOsByAddress(addresses);
    if (!actualUTXOs?.length) {
        throw new UtxoNotFoundError();
    }

    const totalSatoshis = actualUTXOs.reduce((sum, { satoshis }) => sum + satoshis, 0);
    const required = config.collateralAmount[poolType];
    if (totalSatoshis < required) {
        // throw new InsufficientCollateralError(required, totalSatoshis);
    }

    const threshold = collateralUTXOs.length; // TODO
    const multisig = {
        collateral: Address.createMultisig(
            collateralUTXOs.map(c => c.collateralPublicKey), threshold, config.network
        ),
        owner: Address.createMultisig(
            collateralUTXOs.map(c => c.ownerPublicKey), threshold, config.network
        ),
        voter: Address.createMultisig(
            collateralUTXOs.map(c => c.voterPublicKey), threshold, config.network
        ),
        payout: Address.createMultisig(
            collateralUTXOs.map(c => c.payOutPublicKey), threshold, config.network
        ),
    };

    const payload = Transaction.Payload.ProRegTxPayload.fromJSON({
        version: 2,
        collateralHash: '0'.repeat(64),
        collateralIndex: -1,
        service: '195.141.0.143:19999', // TODO: вынести в параметры
        keyIDOwner: multisig.owner.hashBuffer.toString("hex"),
        pubKeyOperator: blsPublicKey,
        keyIDVoting: multisig.voter.hashBuffer.toString("hex"),
        payoutAddress: multisig.payout.toString(),
        operatorReward: 0, // TODO
        inputsHash: '0'.repeat(64),
    });

    const tx = new Transaction()
        .to(multisig.collateral.toString(), required)
        .change(multisig.payout.toString())
        .fee(config.fee)
        .setType(1)
        .setExtraPayload(payload);

    actualUTXOs.forEach(utxo => {
        const input = new PublicKeyHashInput({
            output: utxo,
            prevTxId: utxo.txid,
            outputIndex: utxo.outputIndex,
            script: new Script(utxo.script),
        });
        tx.addInput(input, input.script, input.satoshis);
    });

    return tx;
}