/**
 * Domain model used by the UI. These mirror the data contract documents in DESIGN.md §4,
 * with byte fields already decoded into their human forms (addresses instead of scripts and
 * key IDs, hex strings instead of byte arrays). The data layer does that conversion.
 *
 * All amounts are in duffs (1 DASH = 100,000,000 duffs). Timestamps are Unix milliseconds.
 */

export type Duffs = number

export interface BaseDocument {
  id: string
  ownerId: string
  createdAt: number
}

export interface Pool extends BaseDocument {
  name: string
  description: string
  /**
   * Core P2P address (ip:port) the masternode starts with. Optional: the operator can set or change it
   * at any time with a ProUpServTx. Without one the masternode registers PoSe-banned until then.
   */
  service?: string
  /** Where the node runs: an ISO 3166-1 alpha-2 code (contract enum). Absent means worldwide. */
  location?: string
  /** BLS public key, hex */
  operatorPubKey: string
  votingAddress: string
  /** Basis points, 0–10000 */
  operatorReward: number
  earlyPeriodBlocks: number
  earlyPenalty: Duffs
  /** Total registration tx fee, split between members */
  fee: Duffs
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

export interface Lock extends BaseDocument {
  poolId: string
  /** Join document IDs in share order */
  joinIds: string[]
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
export interface ChatKey extends BaseDocument {
  lockId: string
  /** Fixed-size envelopes, hex (see lib/chatCipher.ts) */
  envelopes: string
}

export interface PrivateMessage extends BaseDocument {
  lockId: string
  /** nonce || AES-256-GCM ciphertext || tag, hex */
  payload: string
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
