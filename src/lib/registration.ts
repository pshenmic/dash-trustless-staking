import { CollateralShare, ExtNetInfo, ExtraPayload, Input, OutPoint, Output, Script, Transaction, TransactionType } from 'dash-core-sdk'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { ripemd160 } from '@noble/hashes/ripemd160'
import { sha256 } from '@noble/hashes/sha256'
import { base64 } from '@scure/base'
import { addressToScript } from './address.js'
import { concatBytes, fromHex, toHex } from './bytes.js'
import { verifyCompact } from './compactSignature.js'
import { SHARED_COLLATERAL_SCRIPT } from './consensus.js'
import type { Duffs, Join, Outpoint, Pool, Prevout } from './types.js'

function doubleSHA256 (bytes: Uint8Array): Uint8Array {
  return sha256(sha256(bytes))
}

/**
 * CProRegTx::inputsHash is consensus-checked against CalcTxInputsHash: SHA256d over the serialized
 * prevouts (hash little-endian + vout), with no scripts or sequences.
 *
 * Returned in display order because the SDK treats this field as a uint256 and reverses it when
 * serializing (`hexToBytes(value).toReversed()`), which then matches the raw digest Core compares.
 */
export function inputsHashOf (tx: Transaction): string {
  const digest = doubleSHA256(concatBytes(...tx.inputs.map(input => new OutPoint(input.txId, input.vOut).bytes())))

  return toHex(Uint8Array.from(digest).reverse())
}

const DUST_THRESHOLD = 546
const COLLATERAL_DUFFS = 1000_00000000n
const ZERO_SIG = '00'.repeat(65)

function outpointKey (op: Outpoint): string { return `${op.txid}:${op.vout}` }

function toScript (addressOrScript: string): Script {
  if (/^76a914[a-fA-F0-9]{40}88ac$/.test(addressOrScript)) return Script.fromHex(addressOrScript)
  return Script.fromHex(toHex(addressToScript(addressOrScript, 'testnet')))
}

function ownerHex (addressOrScript: string): string { return toScript(addressOrScript).hex().slice(6, 46) }

// ---- funding tx ----

export interface FundingResult { hex: string; tx: Transaction; problems: string[] }

export function buildFundingTx (pool: Pool, members: Join[], inputValues: Map<string, Duffs | null>): FundingResult {
  const problems: string[] = []
  const inputs: Input[] = []
  for (const member of members) for (const op of member.inputs) inputs.push(new Input(op.txid, op.vout, new Script(), 0xffffffff))
  if (members.length === 0) return { hex: '', tx: new Transaction([], [], 0, 3, TransactionType.TRANSACTION_NORMAL), problems: ['No members'] }

  const fee = pool.fee ?? 0
  const feePerMember = fee / members.length
  const outputs: Output[] = []

  for (let i = 0; i < members.length; i++) {
    const member = members[i]
    let memberTotal = 0
    for (const op of member.inputs) {
      const value = inputValues.get(outpointKey(op))
      if (value != null) memberTotal += Number(value)
      else problems.push(`missing-input-value:${member.id}/${outpointKey(op)}`)
    }
    const lastFeeShare = fee - Math.floor(feePerMember) * (members.length - 1)
    const feeShare = i === (members.length - 1) ? lastFeeShare : Math.floor(feePerMember)
    const change = memberTotal - (member.amount ?? 0) - feeShare
    if (change > 0 && change >= DUST_THRESHOLD) outputs.push(new Output(BigInt(change), toScript(member.changeAddress)))
    else if (change > 0) problems.push(`dust-change-dropped:${member.id}/${change}`)
  }

  const tx = new Transaction(inputs, outputs, 0, 3, TransactionType.TRANSACTION_NORMAL)
  return { hex: tx.hex(), tx, problems }
}

// ---- registration tx ----

export interface RegistrationTx {
  fundingHex: string; unsignedHex: string; consentHash: string
  collateralIndex: number; members: RegistrationMemberData[]; tx: Transaction; problems: string[]
}
export interface RegistrationMemberData { joinId: string; shareIndex: number; inputCount: number }

function parseService (service: string): ExtNetInfo {
  const net = new ExtNetInfo()
  if (!service) return net
  const [host, portStr] = service.split(':')
  const port = Number.parseInt(portStr ?? '19999', 10)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) net.entries.set(0, [{ type: 0, network: 1, address: host, port }])
  return net
}

export function buildRegistration (pool: Pool, members: Join[], inputValues: Map<string, Duffs | null>): RegistrationTx {
  const funding = buildFundingTx(pool, members, inputValues)
  const problems = [...funding.problems]
  const tx = funding.tx

  const collateralIndex = tx.outputs.length
  tx.outputs.push(new Output(COLLATERAL_DUFFS, Script.fromHex(SHARED_COLLATERAL_SCRIPT)))
  tx.type = TransactionType.TRANSACTION_PROVIDER_REGISTER

  const shares = members.map(m => new CollateralShare(BigInt(m.amount), toScript(m.refundAddress), m.rewardAddress == null ? new Script() : toScript(m.rewardAddress), ownerHex(m.ownerAddress)))

  // Use ExtraPayload.ProRegTX constructor — it's a value, not a namespace
  const ProRegTX = (ExtraPayload as any).ProRegTX as new (...args: any[]) => any

  const payload = new ProRegTX(
    // A shared registration has an internal collateral and no owner key: the share table replaces it
    // (CProRegTx::IsTriviallyValid rejects a non-null collateral hash or owner key for shared regs).
    // The outpoint's `n` is the *output index* of the collateral: Core's standardness exemption for the
    // nonstandard DSHC script only fires when `collateralOutpoint.n == i` (policy.cpp).
    3, 0, 0, new OutPoint('00'.repeat(32), collateralIndex), undefined as any, undefined as any,
    '00'.repeat(20),
    pool.operatorPubKey,
    ownerHex(pool.votingAddress),
    pool.operatorReward ?? 0,
    new Script(),
    inputsHashOf(tx),
    undefined, undefined, undefined, '',
    { netInfo: parseService(pool.service ?? ''), payouts: [], shares, joinSigs: shares.map(() => ZERO_SIG), earlyPeriodBlocks: pool.earlyPeriodBlocks, earlyPenalty: BigInt(pool.earlyPenalty) }
  )
  ;(tx as any).extraPayload = payload

  const hash = tx.consentHash()
  return {
    fundingHex: funding.hex, unsignedHex: tx.hex(), consentHash: hash,
    collateralIndex, tx,
    members: members.map((m, i) => ({ joinId: m.id, shareIndex: i, inputCount: m.inputs.length })),
    problems
  }
}

// ---- signatures ----

/** Consents are stored base64; the payload serializes join signatures as hex */
function signatureToHex (signature: string): string {
  return /^[0-9a-fA-F]{130}$/.test(signature) ? signature.toLowerCase() : toHex(base64.decode(signature))
}

export function withJoinSignatures (reg: RegistrationTx, signatures: string[]): string {
  const ext = ((reg.tx as any).extraPayload?.joinSigs as string[] | undefined)
  if (ext) ext.splice(0, ext.length, ...signatures.map(signatureToHex))
  return reg.tx.hex()
}

export function extractScriptSigs (joinedHex: string, members: Join[], shareIndex: number, signedHex: string): string[] | null {
  try {
    const joined = Transaction.fromHex(joinedHex)
    const signed = Transaction.fromHex(signedHex)
    if (joined.inputs.length !== signed.inputs.length) return null
    const offset = members.slice(0, shareIndex).reduce((s, m) => s + m.inputs.length, 0)
    const count = members[shareIndex]?.inputs.length ?? 0
    const scriptSigs: string[] = []
    for (let i = 0; i < joined.inputs.length; i++) {
      if (i >= offset && i < offset + count) scriptSigs.push(signed.inputs[i].scriptSig.hex())
      else if (joined.inputs[i].scriptSig.hex() !== signed.inputs[i].scriptSig.hex() || joined.inputs[i].sequence !== signed.inputs[i].sequence) return null
    }
    return scriptSigs
  } catch { return null }
}

/**
 * Core returns the consent digest as a uint256 and signs `hash.begin()` — the raw bytes. The hex we
 * display (and that Core prints as `consentHash`) is that digest reversed, so a signature must be
 * made and checked over the reversed bytes, not over the displayed value.
 */
export function rawDigest (displayHash: string): string {
  return toHex(Uint8Array.from(fromHex(displayHash)).reverse())
}

export function verifyConsent (reg: RegistrationTx, members: Join[], shareIndex: number, signatureBase64: string): boolean {
  const member = members[shareIndex]
  if (member == null) return false
  try {
    return verifyCompact(rawDigest(reg.consentHash), toHex(base64.decode(signatureBase64)), ownerHex(member.ownerAddress))
  } catch { return false }
}

/** Legacy SIGHASH_ALL preimage: the tx with every scriptSig blanked except this one, plus the hashtype. */
export function legacySighash (tx: Transaction, inputIndex: number, prevoutScript: string): Uint8Array {
  const copy = Transaction.fromHex(tx.hex())
  for (const input of copy.inputs) input.scriptSig = new Script()
  copy.inputs[inputIndex].scriptSig = Script.fromHex(prevoutScript)
  return doubleSHA256(concatBytes(fromHex(copy.hex()), Uint8Array.of(1, 0, 0, 0)))
}

/** P2PKH scriptSig pushes: <sig with hashtype byte> <pubkey> */
function parseP2pkhScriptSig (scriptSig: string): { signature: Uint8Array, publicKey: Uint8Array } | null {
  try {
    const bytes = fromHex(scriptSig)
    const sigLength = bytes[0]
    if (sigLength < 9 || sigLength > 73) return null
    const signature = bytes.slice(1, 1 + sigLength)
    const pubLength = bytes[1 + sigLength]
    if (pubLength !== 33 && pubLength !== 65) return null
    return { signature, publicKey: bytes.slice(2 + sigLength, 2 + sigLength + pubLength) }
  } catch { return null }
}

function hash160 (bytes: Uint8Array): string {
  return toHex(ripemd160(sha256(bytes)))
}

export function verifyScriptSigs (joinedHex: string, members: Join[], shareIndex: number, scriptSigs: string[], prevouts: Map<string, Prevout | null>): boolean {
  const member = members[shareIndex]
  if (member == null || scriptSigs.length !== member.inputs.length) return false
  try {
    const tx = Transaction.fromHex(joinedHex)
    const offset = members.slice(0, shareIndex).reduce((s, m) => s + m.inputs.length, 0)
    for (let k = 0; k < member.inputs.length; k++) {
      const prevout = prevouts.get(outpointKey(member.inputs[k]))
      if (prevout == null) return false
      if (!/^76a914[a-fA-F0-9]{40}88ac$/.test(prevout.script)) return false // P2PKH only
      const parsed = parseP2pkhScriptSig(scriptSigs[k])
      if (parsed == null) return false
      if (hash160(parsed.publicKey) !== prevout.script.slice(6, 46)) return false
      const signature = secp256k1.Signature.fromBytes(parsed.signature.slice(0, -1), 'der').toBytes('compact')
      const digest = legacySighash(tx, offset + k, prevout.script)
      // prehash: false — the digest is already double-SHA256, and plain verify() would hash it again
      if (!secp256k1.verify(signature, digest, parsed.publicKey, { prehash: false })) return false
    }
    return true
  } catch { return false }
}

export function combine (reg: RegistrationTx, signatures: string[], scriptSigs: string[][]): { hex: string, txid: string } {
  const joined = withJoinSignatures(reg, signatures)
  const tx = Transaction.fromHex(joined)
  let index = 0
  for (const memberSigs of scriptSigs) {
    for (const scriptSig of memberSigs) {
      if (index >= tx.inputs.length) break
      tx.inputs[index++].scriptSig = Script.fromHex(scriptSig)
    }
  }
  return { hex: tx.hex(), txid: tx.hash() }
}