import type {
  ChainTx, ChatKey, Consent, Duffs, EncryptionKey, Feedback, Funding, Join, Lock, MasternodeEntry, Message, Outpoint,
  Pool, Prevout, PrivateMessage
} from '../lib/types'
import type { DissolutionContext, DissolutionVerdict } from '../lib/dissolution'

/*
 * The UI talks to three sources. Today they are mocked (src/data/mock); the live versions are:
 *   PlatformSource  dash-platform-sdk document queries + dash-platform-extension signAndBroadcast
 *   ChainSource     DAPI Core gRPC (getTransaction, broadcastTransaction, subscribeToMasternodeList, ...)
 *   TxBuilder       dash-core-sdk (shared ProRegTx v3 payload, consent hash, signature checks)
 */

export type NewDocument<T> = Omit<T, 'id' | 'ownerId' | 'createdAt'>

export interface PlatformSource {
  listPools: () => Promise<Pool[]>
  getPool: (id: string) => Promise<Pool | null>
  listPoolsByOwner: (ownerId: string) => Promise<Pool[]>
  /** Pools using an operator BLS key (index operatorPubKey + $createdAt), oldest first */
  listPoolsByOperatorKey: (operatorPubKey: string) => Promise<Pool[]>
  listJoins: (poolId: string) => Promise<Join[]>
  listJoinsByOwner: (ownerId: string) => Promise<Join[]>
  /** Locks for the given pools (index poolId + $ownerId) */
  listLocks: (poolIds: string[]) => Promise<Lock[]>
  listConsents: (lockId: string) => Promise<Consent[]>
  listFundings: (lockId: string) => Promise<Funding[]>
  /** The creator's fee signatures for a lock, when the creator pays the registration fee */
  listFeeFundings: (lockId: string) => Promise<Funding[]>
  listMessages: (channel: string) => Promise<Message[]>
  listFeedback: (poolId: string) => Promise<Feedback[]>
  listChatKeys: (lockId: string) => Promise<ChatKey[]>
  listPrivateMessages: (lockId: string) => Promise<PrivateMessage[]>
  /**
   * Identity keys others can encrypt to: enabled ECDSA_SECP256K1 keys with the ENCRYPTION or DECRYPTION
   * purpose, whose full public key is on Platform
   */
  getEncryptionKeys: (identityId: string) => Promise<EncryptionKey[]>
  /** DPNS username of an identity, if it has one */
  getUsername: (identityId: string) => Promise<string | null>

  /** Every write is a state transition signed by `identity` through the extension */
  createPool: (identity: string, data: NewDocument<Pool>) => Promise<Pool>
  createJoin: (identity: string, data: NewDocument<Join>) => Promise<Join>
  createLock: (identity: string, data: NewDocument<Lock>) => Promise<Lock>
  createConsent: (identity: string, data: NewDocument<Consent>) => Promise<Consent>
  createFunding: (identity: string, data: NewDocument<Funding>) => Promise<Funding>
  createFeeFunding: (identity: string, data: NewDocument<Funding>) => Promise<Funding>
  sendMessage: (identity: string, data: NewDocument<Message>) => Promise<Message>
  createFeedback: (identity: string, data: NewDocument<Feedback>) => Promise<Feedback>
  createChatKey: (identity: string, data: NewDocument<ChatKey>) => Promise<ChatKey>
  sendPrivateMessage: (identity: string, data: NewDocument<PrivateMessage>) => Promise<PrivateMessage>
}

export interface ChainSource {
  getBestBlockHeight: () => Promise<number>
  getTransaction: (txid: string) => Promise<ChainTx | null>
  /** Value of a transaction output, read from the funding tx via getTransaction. null if not found. */
  getOutputValue: (outpoint: Outpoint) => Promise<Duffs | null>
  /** Script and value of a previous output, for checking funding signatures. null if not found. */
  getPrevout: (outpoint: Outpoint) => Promise<Prevout | null>
  /** Entry from the simplified masternode list; null when not in the list */
  getMasternode: (proTxHash: string) => Promise<MasternodeEntry | null>
  /**
   * The masternode holding an operator key, if any. Live: search the simplified masternode list under both
   * the legacy and basic BLS encodings, as Core does (HasOperatorKeyUnderAnyScheme).
   */
  getMasternodeByOperatorKey: (operatorPubKey: string) => Promise<MasternodeEntry | null>
  /** Height of the block that mined a transaction, for early-period math */
  getRegisteredHeight: (proTxHash: string) => Promise<number | null>
  /**
   * The block height of the merged simplified masternode list. null until the first full diff
   * arrives. Used to gate DISSOLVED/FORMED/ERROR behind a sufficiently current list.
   */
  getMasternodeListHeight: () => Promise<number | null>
  /** Throws with Core's rejection reason, e.g. when an input is already spent */
  broadcastTransaction: (hex: string) => Promise<string>
}

export interface RegistrationMember {
  join: Join
  feeShare: Duffs
  /** Sum of input values; null while any input value is unknown */
  inputTotal: Duffs | null
  /** inputTotal - amount - feeShare; null while unknown */
  change: Duffs | null
}

export interface RegistrationTx {
  /** Unsigned shared ProRegTx with empty join signatures (what members consent to) */
  unsignedHex: string
  consentHash: string
  collateralIndex: number
  members: RegistrationMember[]
  /** Creator fee inputs, at the end of the transaction when the creator pays */
  feeInputs: Outpoint[]
  feeChangeAddress?: string
  /** Reasons the tx can't be completed, e.g. a member's inputs don't cover their share */
  problems: string[]
}

export interface TxBuilder {
  /** Deterministic build from documents + input values (DESIGN.md §6) */
  buildRegistration: (pool: Pool, members: Join[], inputValues: Map<string, Duffs | null>, feeInputs?: Outpoint[], feeChangeAddress?: string) => RegistrationTx
  /** Checks that the signature recovers to the member's owner key over the consent hash */
  verifyConsent: (tx: RegistrationTx, shareIndex: number, signatureBase64: string) => boolean
  /** Unsigned tx with all join signatures inserted: what members sign their inputs on */
  withJoinSignatures: (tx: RegistrationTx, signatures: string[]) => string
  /** Checks published scriptSigs against the member's inputs in the join-signed tx */
  verifyScriptSigs: (tx: RegistrationTx, shareIndex: number, scriptSigs: string[], prevouts: Map<string, Prevout | null>, joinedHex: string) => boolean
  /** Pulls the member's scriptSigs out of a partially signed tx they pasted; null if they don't verify */
  extractScriptSigs: (tx: RegistrationTx, shareIndex: number, signedHex: string, joinedHex: string) => string[] | null
  /** Checks the creator's fee signatures against the joined tx */
  verifyFeeScriptSigs: (tx: RegistrationTx, scriptSigs: string[], prevouts: Map<string, Prevout | null>, joinedHex: string) => boolean
  /** Pulls the creator fee scriptSigs out of a signed tx */
  extractFeeScriptSigs: (tx: RegistrationTx, signedHex: string, joinedHex: string) => string[] | null
  /** The final tx with all join signatures and scriptSigs, and its txid (= proTxHash) */
  combine: (tx: RegistrationTx, signatures: string[], scriptSigs: string[][], feeScriptSigs?: string[]) => { hex: string, txid: string }
  /** Checks a pasted unilateral ProDisTx: signed, spends this masternode's collateral, refunds every share */
  verifyDissolution: (ctx: DissolutionContext, signedHex: string) => DissolutionVerdict
}

export interface ChatRecipient {
  shareIndex: number
  /** The member's encryption public key, hex */
  publicKey: string
}

/**
 * The two private-chat steps that involve identity keys. Messages themselves are encrypted in the app
 * with the group key (lib/chatCipher.ts).
 */
export interface ChatCrypto {
  /** ECIES-wraps the group key for each recipient. Needs only public keys, so no wallet prompt. */
  wrapGroupKey: (groupKey: Uint8Array, recipients: ChatRecipient[]) => Promise<string>
  /**
   * Opens the member's own envelope with their identity encryption key. Live: ECIES with the key held by
   * the private-key session. Returns null when the envelope isn't theirs or doesn't open.
   */
  unwrapGroupKey: (identity: string, keyId: number, envelope: Uint8Array) => Promise<Uint8Array | null>
}

export interface HostingTerms {
  /** Minimum operator reward, in basis points, a hosted pool must register with */
  operatorRewardMin: number
  description: string
  url: string
}

export interface HostingServer {
  name: string
  region: string
  /** BLS operator public key, 96 hex characters */
  operatorPubKey: string
}

export interface HostingOptions {
  terms: HostingTerms | null
  servers: HostingServer[]
}

/** The pshenmic.dev hosting contract: terms and servers available for a new pool */
export interface HostingSource {
  getOptions: () => Promise<HostingOptions>
}

export interface BackendFeatures {
  /** Signing, broadcasting and masternode status: on once the live registration builder is wired */
  registration: boolean
  /** Private chat: needs a private-key session with the identity's encryption key */
  privateChat: boolean
}

export interface Backend {
  mode: 'mock' | 'live'
  features: BackendFeatures
  platform: PlatformSource
  chain: ChainSource
  tx: TxBuilder
  chat: ChatCrypto
  hosting: HostingSource
}

export function outpointKey (outpoint: Outpoint): string {
  return `${outpoint.txid}:${outpoint.vout}`
}
