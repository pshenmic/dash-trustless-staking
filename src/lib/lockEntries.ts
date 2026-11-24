import { base58 } from '@scure/base'
import { addressToKeyId, addressToScript, keyIdToAddress, scriptToAddress } from './address'
import { ByteReader, concatBytes, fromHex, toHex } from './bytes'
import { MAX_SHARES } from './consensus'
import type { Join, Lock, LockEntry, Network, Outpoint } from './types'

/*
 * The lock carries a packed copy of every accepted share, so the selected set can be audited from the
 * lock alone and does not depend on re-reading the joins. Platform arrays hold scalars only, so each
 * share is one hex string with this byte layout:
 *
 *   joinId 32 | ownerId 32 | amount 8 LE | ownerKeyId 20 |
 *   1 + refundScript | 1 + rewardScript (0 = refundScript) | 1 + changeScript |
 *   inputCount 1 | 36 x inputs (txid internal order + vout uint32 LE)
 *
 * A P2PKH share with one input is 182 bytes (364 hex characters).
 */
export const MAX_ENTRY_BYTES = 1024

const HEX = /^[0-9a-f]+$/

function uint64LE (value: number): Uint8Array {
  const out = new Uint8Array(8)
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true)
  return out
}

function uint32LE (value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}

/** The copy of a join that the lock stores */
export function lockEntryOf (join: Join): LockEntry {
  return {
    joinId: join.id,
    ownerId: join.ownerId,
    amount: join.amount,
    ownerAddress: join.ownerAddress,
    refundAddress: join.refundAddress,
    ...(join.rewardAddress != null ? { rewardAddress: join.rewardAddress } : {}),
    changeAddress: join.changeAddress,
    inputs: join.inputs
  }
}

export function packEntry (entry: LockEntry, network: Network): string {
  const joinId = base58.decode(entry.joinId)
  if (joinId.length !== 32) throw new Error(`A share id must be 32 bytes: ${entry.joinId}`)
  const ownerId = base58.decode(entry.ownerId)
  if (ownerId.length !== 32) throw new Error(`An owner id must be 32 bytes: ${entry.ownerId}`)
  if (!Number.isInteger(entry.amount) || entry.amount < 0) throw new Error('A share amount must be whole duffs')
  if (entry.inputs.length === 0 || entry.inputs.length > 255) throw new Error('A share needs 1 to 255 inputs')

  const refundScript = addressToScript(entry.refundAddress, network)
  const rewardScript = entry.rewardAddress != null ? addressToScript(entry.rewardAddress, network) : new Uint8Array()
  const changeScript = addressToScript(entry.changeAddress, network)
  for (const script of [refundScript, rewardScript, changeScript]) {
    if (script.length > 255) throw new Error('A share script must fit in 255 bytes')
  }

  const bytes = concatBytes(
    joinId,
    ownerId,
    uint64LE(entry.amount),
    addressToKeyId(entry.ownerAddress, network),
    Uint8Array.of(refundScript.length), refundScript,
    Uint8Array.of(rewardScript.length), rewardScript,
    Uint8Array.of(changeScript.length), changeScript,
    Uint8Array.of(entry.inputs.length),
    ...entry.inputs.map(input => {
      if (!/^[0-9a-fA-F]{64}$/.test(input.txid)) throw new Error(`Not a txid: ${input.txid}`)
      // txids are displayed reversed; the lock packs them the way a transaction serializes them
      return concatBytes(fromHex(input.txid).reverse(), uint32LE(input.vout))
    })
  )
  if (bytes.length > MAX_ENTRY_BYTES) {
    throw new Error(`This share packs to ${bytes.length} bytes, over the ${MAX_ENTRY_BYTES}-byte limit — the lock cannot record it`)
  }
  return toHex(bytes)
}

export function unpackEntry (packed: string, network: Network): LockEntry {
  if (packed.length % 2 !== 0 || !HEX.test(packed.toLowerCase())) throw new Error('A packed share must be hex')
  const reader = new ByteReader(fromHex(packed))
  const script = (length: number): string => {
    const address = scriptToAddress(reader.read(length), network)
    if (address == null) throw new Error('A packed share script is not a P2PKH or P2SH output')
    return address
  }

  const joinId = base58.encode(reader.read(32))
  const ownerId = base58.encode(reader.read(32))
  const amount = reader.uint64()
  const ownerAddress = keyIdToAddress(reader.read(20), network)
  const refundAddress = script(reader.read(1)[0])
  const rewardLength = reader.read(1)[0]
  const rewardAddress = rewardLength === 0 ? undefined : script(rewardLength)
  const changeAddress = script(reader.read(1)[0])

  const count = reader.read(1)[0]
  if (count === 0 || count > 32) throw new Error(`A packed share has ${count} inputs`)
  const inputs: Outpoint[] = []
  for (let i = 0; i < count; i++) inputs.push({ txid: toHex(reader.read(32).reverse()), vout: reader.uint32() })
  if (!reader.done) throw new Error('A packed share has trailing bytes')

  return {
    joinId,
    ownerId,
    amount,
    ownerAddress,
    refundAddress,
    ...(rewardAddress != null ? { rewardAddress } : {}),
    changeAddress,
    inputs
  }
}

/**
 * Decodes stored entries without throwing: a malformed string becomes a null slot, and the lock then
 * reports a problem instead of sinking the query that read it.
 */
export function unpackEntries (entries: string[], network: Network): Array<LockEntry | null> {
  return entries.map(packed => {
    try {
      return unpackEntry(packed, network)
    } catch {
      return null
    }
  })
}

function sameEntry (entry: LockEntry, join: Join): boolean {
  const sameReward = (entry.rewardAddress ?? entry.refundAddress) === (join.rewardAddress ?? join.refundAddress)
  const sameInputs = entry.inputs.length === join.inputs.length &&
    entry.inputs.every((input, i) => input.txid === join.inputs[i].txid && input.vout === join.inputs[i].vout)
  return entry.ownerId === join.ownerId &&
    entry.amount === join.amount &&
    entry.ownerAddress === join.ownerAddress &&
    entry.refundAddress === join.refundAddress &&
    entry.changeAddress === join.changeAddress &&
    sameReward &&
    sameInputs
}

/**
 * The lock records each share as one string of at most MAX_ENTRY_BYTES, so a share funded from too many
 * UTXOs cannot be locked. Checked while the creator is still choosing, not only when the write fails.
 */
export function packingProblems (entries: Array<LockEntry | null>, network: Network): string[] {
  return entries.flatMap(entry => {
    try {
      if (entry == null) throw new Error('A selected share is missing')
      packEntry(entry, network)
      return []
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)]
    }
  })
}

/**
 * Cross-checks the packed copies against the joins the lock names. A lock published before the entries
 * existed has none, and there is nothing to check.
 */
export function entriesProblems (lock: Lock, joins: Join[]): string[] {
  const entries = lock.entries
  if (entries == null) return []
  const problems: string[] = []
  if (entries.length !== lock.joinIds.length) {
    const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
    problems.push(`The lock packs ${count(entries.length, 'share')} but names ${count(lock.joinIds.length, 'join')}`)
  }
  if (entries.length > MAX_SHARES) problems.push(`The lock packs more than ${MAX_SHARES} shares`)
  const byId = new Map(joins.map(join => [join.id, join]))
  entries.forEach((entry, i) => {
    if (entry == null) {
      problems.push('A packed share could not be read')
      return
    }
    const joinId = lock.joinIds[i]
    if (joinId == null) return
    if (entry.joinId !== joinId) problems.push('The packed shares name different joins than the lock')
    const join = byId.get(joinId)
    // A missing join is already reported by the lock resolution
    if (join != null && !sameEntry(entry, join)) problems.push('A packed share does not match its join document')
  })
  return [...new Set(problems)]
}