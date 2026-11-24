/**
 * Domain model used by the UI. These mirror the data contract documents in DESIGN.md §4,
 * with byte fields already decoded into their human forms (addresses instead of scripts and
 * key IDs, hex strings instead of byte arrays). The data layer does that conversion.
 *
 * All amounts are in duffs (1 DASH = 100,000,000 duffs). Timestamps are Unix milliseconds.
 */

export type Duffs = number

export type FeePayer = 'creator' | 'members'

export interface BaseDocument {
  id: string
  ownerId: string
  createdAt: number
}

export interface Pool extends BaseDocument {
  /** Optional since generation 2: a pool is created without a name and may be titled later through poolMeta */
  name?: string
  description?: string
  /**
   * Core P2P address (ip:port) the masternode starts with. Optional: the operator can set or change it
   * at any time with a ProUpServTx. Without one the masternode registers PoSe-banned until then.
   */
  service?: string
  /** BLS public key, hex */
  operatorPubKey: string
  votingAddress: string
  /** Basis points, 0–10000 */
  operatorReward: number
  earlyPeriodBlocks: number
  earlyPenalty: Duffs
  /** Total registration tx fee, paid by the members or by the creator */
  fee: Duffs
  /** Who pays the registration fee; missing on old pools means members */
  feePayer?: FeePayer
}

export interface Outpoint {
  txid: string
  vout: number
}

/** Previous output as the chain reports it: script hex plus value */
export interface Prevout {
  script: string
  value: Duffs
}

export interface Join extends BaseDocument {
  poolId: string
  amount: Duffs
  ownerAddress: string
  refundAddress: string
  rewardAddress?: string
  inputs: Outpoint[]
  changeAddress: string
  /**
   * ID of the member's identity key that the private chat key is encrypted to. Optional: a member
   * without one still joins, but can't read the pool's private chat.
   */
  encryptionKeyId?: number
}

/** A share copied into the lock, so the accepted set can be audited without resolving every join */
export interface LockEntry {
  joinId: string
  ownerId: string
  amount: Duffs
  ownerAddress: string
  refundAddress: string
  /** Absent when the join pays rewards to the refund address */
  rewardAddress?: string
  changeAddress: string
  inputs: Outpoint[]
}

export interface Lock extends BaseDocument {
  poolId: string
  /** Join document IDs in share order */
  joinIds: string[]
  /** Creator fee outpoints, when the creator pays the registration fee */
  feeInputs?: Outpoint[]
  /** Change address for the creator fee inputs; absent when the inputs exactly cover the fee */
  feeChangeAddress?: string
  /**
   * Packed copies of the accepted shares, in share order (lib/lockEntries.ts). Optional: locks created
   * before the field existed have none. A null slot is a stored entry that could not be decoded.
   */
  entries?: Array<LockEntry | null>
}

export interface Consent extends BaseDocument {
  lockId: string
  /** 65-byte compact signature, base64 */
  signature: string
}

export interface Funding extends BaseDocument {
  lockId: string
  /** scriptSigs of the member's inputs, hex, in their input order */
  scriptSigs: string[]
}

export interface Feedback extends BaseDocument {
  poolId: string
  rating: number
  text: string
}

export interface Message extends BaseDocument {
  /** 'global' or a pool ID */
  channel: string
  text: string
}

/** The private chat's group key, wrapped once per selected member. Published by a lock member. */
/** Governance vote outcome, Core's vote_outcome_t: 1 YES, 2 NO, 3 ABSTAIN */
export type VoteOutcome = 1 | 2 | 3

/** A member's recorded choice on a proposal. Immutable; the newest per member counts (lib/voting.ts) */
export interface Vote extends BaseDocument {
  poolId: string
  /** Governance object hash, hex */
  proposalHash: string
  outcome: VoteOutcome
}

/**
 * Display metadata for a pool. Immutable and append-only: the newest document signed by the pool's
 * creator wins, so every rename stays visible in the pool's history.
 */
export interface PoolMeta extends BaseDocument {
  poolId: string
  /** Retired by the creator: readers sink it and mark it. Documentation only — nothing stops working. */
  archived?: boolean
  name?: string
  description?: string
  /** PNG bytes, at most 8 KiB */
}

/** An identity public key others can encrypt to */
export interface EncryptionKey {
  id: number
  /** Compressed secp256k1 public key, hex */
  publicKey: string
}

/** Entry of the simplified masternode list streamed by DAPI */
export interface MasternodeEntry {
  proTxHash: string
  isValid: boolean
  /** Current Core P2P address; empty when none is set */
  service: string
}

export interface ChainTx {
  txid: string
  /** null while in the mempool */
  height: number | null
}

export type PoolStatus = 'NEW' | 'SIGNING' | 'REGISTERED' | 'FORMED' | 'ERROR' | 'DISSOLVING' | 'DISSOLVED'

/** The pools list only uses Platform data, so it can tell NEW from LOCKED and nothing more */
export type PoolListStatus = 'NEW' | 'LOCKED'

export type Network = 'testnet' | 'mainnet'
