import { ExtraPayload, Input, Network as CoreNetwork, Output, Script, Transaction, TransactionType } from 'dash-core-sdk'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { ripemd160 } from '@noble/hashes/ripemd160'
import { sha256 } from '@noble/hashes/sha256'
import { addressToKeyId, addressToScript } from './address.js'
import { concatBytes, fromHex, toHex } from './bytes.js'
import { signCompact, verifyCompact } from './compactSignature.js'
import { inputsHashOf, legacySighash } from './registration.js'
import { parsePrivateKey, p2pkhScriptSig } from './signFunding.js'
import type { Outpoint, Prevout } from './types.js'
import type { Network } from './types.js'

/*
 * ProUpShareTx (consensus special tx type 11): one share's reward script, signed by that share's owner
 * key alone. Core's external path is `protx shared_update_share … false`, which returns the signed hex;
 * this module builds the Core command, and preflights the reply before the app broadcasts it.
 */

const SHARE_UPDATE_TYPE = 11
const PAYLOAD_VERSION = 1

export interface ShareUpdate {
  proTxHash: string
  shareIndex: number
  rewardAddress: string
  /** CalcTxInputsHash of the carrying transaction, display order (the SDK reverses it on the wire) */
  inputsHash: string
}

/** Why an address cannot be used as the new reward script, or null when it can */
export function rewardAddressProblem (address: string, shares: { votingAddress: string, ownerAddresses: string[] }, network: Network = 'testnet'): string | null {
  let script: Uint8Array
  try {
    script = addressToScript(address, network)
  } catch {
    return 'That is not a valid address for this network.'
  }
  if (script.length === 0) return 'That is not a valid address for this network.'
  if (address === shares.votingAddress) return 'The reward address cannot be the pool voting address.'
  if (shares.ownerAddresses.includes(address)) return 'The reward address cannot be any share owner address.'
  return null
}

/** Core's `dash-cli` invocation; `submit=false` returns the signed hex instead of sending it */
export function shareUpdateCommand (update: { proTxHash: string, shareIndex: number, rewardAddress: string, feeSourceAddress: string }, network: Network = 'testnet'): string {
  const flag = network === 'testnet' ? '-testnet ' : ''
  return `dash-cli ${flag}protx shared_update_share "${update.proTxHash}" ${update.shareIndex} "${update.rewardAddress}" "${update.feeSourceAddress}" false`
}

/** Payload bytes as Core hashes them for the owner signature: everything except the signature field */
export function shareUpdateBytes (update: ShareUpdate, network: Network = 'testnet'): Uint8Array {
  const script = Script.fromHex(toHex(addressToScript(update.rewardAddress, network))).bytes()
  return concatBytes(
    u16(PAYLOAD_VERSION),
    Uint8Array.from(fromHex(update.proTxHash)).reverse(),
    u16(update.shareIndex),
    compactSize(script.length),
    script,
    Uint8Array.from(fromHex(update.inputsHash)).reverse()
  )
}

/** The digest the share owner signs: SHA256d over the payload without its signature (Core's SerializeHash) */
export function shareUpdateDigest (update: ShareUpdate, network: Network = 'testnet'): string {
  return toHex(doubleSHA256(shareUpdateBytes(update, network)))
}

export interface ShareUpdateCheck {
  problems: string[]
  txid: string | null
  shareIndex: number | null
  rewardAddress: string | null
}

/**
 * Preflight a signed ProUpShareTx returned by Core: the payload must describe the update we asked for,
 * the inputs hash must cover the transaction, the signature must recover to the share owner key, and the
 * new reward script must obey Core's payee-separation rule.
 */
export function checkSignedShareUpdate (hex: string, expected: Omit<ShareUpdate, 'inputsHash'>, shareOwnerAddress: string, shares: { votingAddress: string, ownerAddresses: string[] }, network: Network = 'testnet'): ShareUpdateCheck {
  const fail = (problem: string): ShareUpdateCheck => ({ problems: [problem], txid: null, shareIndex: null, rewardAddress: null })

  let tx: Transaction
  try {
    tx = Transaction.fromHex(hex)
  } catch {
    return fail('That is not a readable transaction.')
  }
  if (Number(tx.type) !== SHARE_UPDATE_TYPE) return fail('That transaction is not a ProUpShareTx.')

  const payload = (tx as unknown as { extraPayload?: { proTxHash: string, shareIndex: number, scriptReward: Script, inputsHash: string, payloadSig: string } }).extraPayload
  if (payload == null) return fail('That transaction has no share-update payload.')

  const rewardAddress = addressFromScript(payload.scriptReward, network)
  const problems: string[] = []

  if (payload.proTxHash !== expected.proTxHash) problems.push('The transaction belongs to a different pool.')
  if (payload.shareIndex !== expected.shareIndex) problems.push(`The transaction updates share ${payload.shareIndex}, not share ${expected.shareIndex}.`)
  if (rewardAddress == null || rewardAddress !== expected.rewardAddress) problems.push('The reward address in the transaction does not match the one you entered.')

  if (payload.inputsHash !== inputsHashOf(tx)) problems.push('The payload inputs hash does not match the transaction.')

  const addressProblem = rewardAddress == null ? null : rewardAddressProblem(rewardAddress, shares, network)
  if (addressProblem != null) problems.push(addressProblem)

  const digest = shareUpdateDigest({ ...expected, inputsHash: payload.inputsHash }, network)
  if (!verifyCompact(digest, payload.payloadSig, toHex(addressToKeyId(shareOwnerAddress, network)))) {
    problems.push(`The signature does not belong to this share's owner key (${shareOwnerAddress}).`)
  }

  return { problems, txid: tx.hash(), shareIndex: payload.shareIndex, rewardAddress }
}

function addressFromScript (script: Script, network: Network): string | null {
  try {
    return script.getAddress(network === 'testnet' ? 'testnet' : 'mainnet') ?? null
  } catch {
    return null
  }
}

function doubleSHA256 (bytes: Uint8Array): Uint8Array {
  return sha256(sha256(bytes))
}

function u16 (value: number): Uint8Array {
  const bytes = new Uint8Array(2)
  new DataView(bytes.buffer).setUint16(0, value, true)
  return bytes
}

function compactSize (length: number): Uint8Array {
  if (length < 0xfd) return Uint8Array.of(length)
  if (length <= 0xffff) return Uint8Array.of(0xfd, length & 0xff, length >> 8)
  throw new Error('script too long')
}

const DUST = 546

function hash160 (bytes: Uint8Array): string {
  return toHex(ripemd160(sha256(bytes)))
}

export interface SignShareUpdateParams {
  proTxHash: string
  shareIndex: number
  rewardAddress: string
  /** On-chain owner address of this share, so a wrong key is refused before anything is signed */
  shareOwnerAddress: string
  fee: { outpoint: Outpoint, prevout: Prevout }
  feeAmount: number
  changeAddress?: string
  ownerKeyText: string
  feeKeyText: string
  network?: Network
}

export type SignShareUpdateResult =
  | { ok: true, hex: string, txid: string }
  | { ok: false, error: string }

/**
 * In-browser path: build the ProUpShareTx, sign the payload with the share owner key (compact) and the
 * fee input with the UTXO key (SIGHASH_ALL). Core does the same inside `shared_update_share`; doing it
 * here keeps the keys in the tab and needs no Core wallet.
 */
export function signShareUpdate (params: SignShareUpdateParams): SignShareUpdateResult {
  const network = params.network ?? 'testnet'
  const coreNetwork = network === 'testnet' ? CoreNetwork.Testnet : CoreNetwork.Mainnet
  const ownerKey = parsePrivateKey(params.ownerKeyText)
  const feeKey = parsePrivateKey(params.feeKeyText)
  if (ownerKey == null) return { ok: false, error: 'The share owner key is not a valid WIF or 64-character hex key' }
  if (feeKey == null) return { ok: false, error: 'The fee key is not a valid WIF or 64-character hex key' }

  const ownerAddress = ownerKey.getPublicKey().getAddress(coreNetwork)
  if (ownerAddress !== params.shareOwnerAddress) {
    return { ok: false, error: `That share owner key controls ${ownerAddress}, not ${params.shareOwnerAddress}` }
  }

  const prevoutMatch = /^76a914([0-9a-fA-F]{40})88ac$/.exec(params.fee.prevout.script)
  if (prevoutMatch == null) return { ok: false, error: 'The fee input is not a P2PKH output, so it cannot be signed here' }
  if (hash160(feeKey.getPublicKey().bytes()) !== prevoutMatch[1].toLowerCase()) {
    return { ok: false, error: `The fee key does not control ${params.fee.outpoint.txid}:${params.fee.outpoint.vout}` }
  }

  const change = params.fee.prevout.value - params.feeAmount
  if (change < 0) {
    return { ok: false, error: `The fee input holds ${params.fee.prevout.value} duffs, less than the ${params.feeAmount} fee` }
  }

  const outputs: Output[] = []
  if (change >= DUST) {
    const changeAddress = params.changeAddress?.trim() ?? ''
    if (changeAddress === '') return { ok: false, error: 'Enter a change address for the rest of the fee input' }
    try {
      outputs.push(new Output(BigInt(change), Script.fromHex(toHex(addressToScript(changeAddress, network)))))
    } catch {
      return { ok: false, error: 'That change address is not valid for this network' }
    }
  }

  try {
    const tx = new Transaction(
      [new Input(params.fee.outpoint.txid, params.fee.outpoint.vout, new Script(), 0xffffffff)],
      outputs,
      0,
      3,
      TransactionType.TRANSACTION_PROVIDER_UPDATE_SHARE
    )

    const inputsHash = inputsHashOf(tx)
    const digest = shareUpdateDigest({ proTxHash: params.proTxHash, shareIndex: params.shareIndex, rewardAddress: params.rewardAddress, inputsHash }, network)
    const scriptReward = Script.fromHex(toHex(addressToScript(params.rewardAddress, network)))
    const ProUpShareTx = (ExtraPayload as any).ProUpShareTx as new (...args: any[]) => unknown
    ;(tx as any).extraPayload = new ProUpShareTx(1, params.proTxHash, params.shareIndex, scriptReward, inputsHash, signCompact(digest, ownerKey))

    const sighash = legacySighash(tx, 0, params.fee.prevout.script)
    const compact = secp256k1.sign(sighash, feeKey.key, { prehash: false, lowS: true })
    const der = secp256k1.Signature.fromBytes(compact, 'compact').toBytes('der')
    const withHashtype = new Uint8Array(der.byteLength + 1)
    withHashtype.set(der)
    withHashtype[der.byteLength] = 1 // SIGHASH_ALL
    tx.inputs[0].scriptSig = Script.fromHex(p2pkhScriptSig(withHashtype, feeKey.getPublicKey().bytes()))

    return { ok: true, hex: tx.hex(), txid: tx.hash() }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not sign the reward update' }
  }
}