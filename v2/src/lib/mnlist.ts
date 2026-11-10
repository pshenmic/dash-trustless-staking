import { ExtraPayload, Transaction } from 'dash-core-sdk'

/** A single masternode entry from the merged list. */
export interface MnListEntry {
  proTxHash: string
  isValid: boolean
  /** Service address like "1.2.3.4:19999", or null when the node has no registered service. */
  service: string | null
  /** The operator public key as printed by Core (scheme-dependent; compared verbatim). */
  operatorPubKey: string
}

/** A decoded `protx diff` payload, either a full snapshot or an incremental delta. */
export interface MnListDiff {
  baseBlockHash: string
  blockHash: string
  height: number | null
  /** proTxHashes that were removed in this diff. */
  deleted: string[]
  /** Masternodes that were added or changed in this diff. */
  added: MnListEntry[]
}

/**
 * The block height a diff is anchored at. DAPI forwards Core's `protx diff` JSON, whose `cbTx` is
 * the coinbase special transaction as hex — the height lives inside its CCbTx payload. Older
 * payloads carry the height as an object instead, so both shapes are accepted.
 */
function heightFromCbTx (cbTx: unknown): number | null {
  if (typeof cbTx === 'string') {
    try {
      const payload = Transaction.fromHex(cbTx).extraPayload

      return payload instanceof ExtraPayload.CbTx ? payload.height : null
    } catch {
      return null
    }
  }

  if (cbTx != null && typeof cbTx === 'object' && typeof (cbTx as { height?: unknown }).height === 'number') {
    return (cbTx as { height: number }).height
  }

  return null
}

/**
 * Decode a raw `protx diff` object (as unwrapped from the CBOR stream or from Core's JSON output)
 * into a strongly-typed diff.
 */
export function parseMnListDiff (diffObj: Record<string, unknown>): MnListDiff {
  const baseBlockHash = String(diffObj.baseBlockHash ?? '')
  const blockHash = String(diffObj.blockHash ?? '')

  const height = heightFromCbTx(diffObj.cbTx)

  const deleted: string[] = Array.isArray(diffObj.deletedMNs) ? (diffObj.deletedMNs as string[]) : []
  const mnList: Array<Record<string, unknown>> = Array.isArray(diffObj.mnList) ? (diffObj.mnList as Array<Record<string, unknown>>) : []

  const added: MnListEntry[] = mnList.map(entry => ({
    proTxHash: String(entry.proRegTxHash ?? ''),
    isValid: Boolean(entry.isValid),
    service: addressFromEntry(entry),
    operatorPubKey: String(entry.pubKeyOperator ?? '')
  }))

  return { baseBlockHash, blockHash, height, deleted, added }
}

function addressFromEntry (entry: Record<string, unknown>): string | null {
  const addresses = entry.addresses as Record<string, unknown> | undefined

  if (addresses !== undefined && typeof addresses.core_p2p === 'string') return addresses.core_p2p
  if (typeof entry.service === 'string') return entry.service

  return null
}

/**
 * A merged masternode list that applies `protx diff` deltas in order, keyed by proTxHash.
 *
 * A full diff (baseBlockHash of 64 zeroes) replaces the entire list. An incremental diff
 * applies deletions then additions on top of the current state. When the incoming diff's
 * `baseBlockHash` does not match the current tip, `needsResync` is set to `true`, and the
 * caller should resubscribe.
 */
export class SimplifiedMNList {
  readonly #entries = new Map<string, MnListEntry>()
  #blockHash = ''
  #height: number | null = null
  needsResync = false

  /** Apply one decoded diff. */
  apply (diff: MnListDiff): void {
    if (diff.baseBlockHash === FULL_DIFF_HASH) {
      this.#entries.clear()
    } else if (diff.baseBlockHash !== this.#blockHash) {
      this.needsResync = true

      return
    }

    this.needsResync = false

    for (const hash of diff.deleted) this.#entries.delete(hash)
    for (const entry of diff.added) this.#entries.set(entry.proTxHash, entry)

    this.#blockHash = diff.blockHash

    if (diff.height !== null) this.#height = diff.height
  }

  /** Look up a masternode by its proTxHash. */
  get (proTxHash: string): MnListEntry | null {
    return this.#entries.get(proTxHash) ?? null
  }

  /** Find a masternode whose operator key matches (case-insensitive). */
  byOperatorKey (key: string): MnListEntry | null {
    key = key.toLowerCase()

    for (const entry of this.#entries.values()) {
      if (entry.operatorPubKey.toLowerCase() === key) return entry
    }

    return null
  }

  /** The block height of the latest applied diff, or null until the first full diff arrives. */
  get height (): number | null {
    return this.#height
  }
}

const FULL_DIFF_HASH = '00'.repeat(32)