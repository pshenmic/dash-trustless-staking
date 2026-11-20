import { base58, base64 } from '@scure/base'
import type { DashPlatformSDK } from 'dash-platform-sdk'
import { DataContractWASM } from 'pshenmic-dpp'
import schema from '../../../schema.json'
import { contractNonce, contractOwner } from '../../config'
import { addressToKeyId, addressToScript, keyIdToAddress, scriptToAddress } from '../../lib/address'
import { ByteReader, compactSize, concatBytes, fromHex, toHex } from '../../lib/bytes'
import { isCountryCode } from '../../lib/countries'
import { normalizeDisplayText, normalizeMultilineText } from '../../lib/text'
import type {
  ChatKey, Consent, Feedback, Funding, Join, Lock, Message, Network, Outpoint, Pool, PrivateMessage, Vote
} from '../../lib/types'
import type { PlatformSource } from '../types'

/*
 * PlatformSource over the deployed data contract (schema.json), using dash-platform-sdk.
 * Reads are plain document queries. Writes build an unsigned state transition and hand it to a signer:
 * Dash Platform Extension in the browser, a private key in the test scripts.
 *
 * The contract stores bytes; the UI model uses addresses, hex and base58. This module is the only place
 * that converts between them. Documents that don't decode (for example a script that is neither P2PKH
 * nor P2SH) are dropped, the same way clients ignore any invalid document.
 */

/** Signs and broadcasts a state transition for the identity that owns the document */
export type Signer = (stateTransition: { bytes: () => Uint8Array }) => Promise<void>

/** The contract instance `documents.query` accepts instead of an id (dash-platform-sdk#119) */
type DataContract = Awaited<ReturnType<DashPlatformSDK['dataContracts']['getDataContractByIdentifier']>>

interface RawDocument {
  id: { base58: () => string }
  ownerId: { base58: () => string }
  createdAt?: bigint
  properties: Record<string, unknown>
}

type Where = Array<[string, string, unknown]>
type OrderBy = Array<[string, 'asc' | 'desc']>

const PAGE = 100
const DPNS_CONTRACT_ID = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const NAME_BATCH = 25
const CONFIRM_TIMEOUT_MS = 45_000

const asBytes = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) return value
  if (Array.isArray(value)) return Uint8Array.from(value as number[])
  throw new Error('Expected a byte array')
}
const asId = (value: unknown): string => typeof value === 'string' ? value : base58.encode(asBytes(value))
const asNumber = (value: unknown): number => Number(value)
const idBytes = (id: string): Uint8Array => base58.decode(id)

function encodeOutpoints (outpoints: Outpoint[]): Uint8Array {
  return concatBytes(...outpoints.map(o => {
    const vout = new Uint8Array(4)
    new DataView(vout.buffer).setUint32(0, o.vout, true)
    // txids are shown reversed; the transaction serializes them in internal byte order
    return concatBytes(fromHex(o.txid).reverse(), vout)
  }))
}

function decodeOutpoints (bytes: Uint8Array): Outpoint[] {
  if (bytes.length === 0 || bytes.length % 36 !== 0) throw new Error('inputs is not a multiple of 36 bytes')
  const reader = new ByteReader(bytes)
  const out: Outpoint[] = []
  while (!reader.done) out.push({ txid: toHex(reader.read(32).reverse()), vout: reader.uint32() })
  return out
}

function encodeScriptSigs (scriptSigs: string[]): Uint8Array {
  return concatBytes(...scriptSigs.flatMap(s => { const b = fromHex(s); return [compactSize(b.length), b] }))
}

function decodeScriptSigs (bytes: Uint8Array): string[] {
  const reader = new ByteReader(bytes)
  const out: string[] = []
  while (!reader.done) out.push(toHex(reader.read(reader.compactSize())))
  return out
}

function decodeJoinIds (bytes: Uint8Array): string[] {
  if (bytes.length === 0 || bytes.length % 32 !== 0) throw new Error('joinIds is not a multiple of 32 bytes')
  return Array.from({ length: bytes.length / 32 }, (_, i) => base58.encode(bytes.slice(i * 32, (i + 1) * 32)))
}

export function createLivePlatform (sdk: DashPlatformSDK, contractId: string, network: Network, signer: Signer): PlatformSource {
  const base = (doc: RawDocument): { id: string, ownerId: string, createdAt: number } => ({
    id: doc.id.base58(), ownerId: doc.ownerId.base58(), createdAt: Number(doc.createdAt ?? 0n)
  })
  const address = (script: unknown): string => {
    const value = scriptToAddress(asBytes(script), network)
    if (value == null) throw new Error('Script is neither P2PKH nor P2SH')
    return value
  }

  const decoders = {
    pool: (doc: RawDocument): Pool => {
      const p = doc.properties
      const location = p.location as string | undefined
      return {
        ...base(doc),
        name: normalizeDisplayText(String(p.name)),
        description: normalizeMultilineText(String(p.description ?? '')),
        ...(typeof p.service === 'string' && p.service !== '' ? { service: p.service } : {}),
        ...(location != null && isCountryCode(location) ? { location } : {}),
        operatorPubKey: toHex(asBytes(p.operatorPubKey)),
        votingAddress: keyIdToAddress(asBytes(p.votingKeyId), network),
        operatorReward: asNumber(p.operatorReward),
        earlyPeriodBlocks: asNumber(p.earlyPeriodBlocks),
        earlyPenalty: asNumber(p.earlyPenalty),
        fee: asNumber(p.fee),
        ...(p.feePayer === 'creator' || p.feePayer === 'members' ? { feePayer: p.feePayer } : {})
      }
    },
    join: (doc: RawDocument): Join => {
      const p = doc.properties
      return {
        ...base(doc),
        poolId: asId(p.poolId),
        amount: asNumber(p.amount),
        ownerAddress: keyIdToAddress(asBytes(p.ownerKeyId), network),
        refundAddress: address(p.refundScript),
        ...(p.rewardScript != null ? { rewardAddress: address(p.rewardScript) } : {}),
        inputs: decodeOutpoints(asBytes(p.inputs)),
        changeAddress: address(p.changeScript),
        ...(p.encryptionKeyId != null ? { encryptionKeyId: asNumber(p.encryptionKeyId) } : {})
      }
    },
    lock: (doc: RawDocument): Lock => ({
      ...base(doc),
      poolId: asId(doc.properties.poolId),
      joinIds: decodeJoinIds(asBytes(doc.properties.joinIds)),
      ...(doc.properties.feeInputs != null ? { feeInputs: decodeOutpoints(asBytes(doc.properties.feeInputs)) } : {}),
      ...(typeof doc.properties.feeChangeAddress === 'string' && doc.properties.feeChangeAddress !== '' ? { feeChangeAddress: doc.properties.feeChangeAddress } : {})
    }),
    consent: (doc: RawDocument): Consent => ({ ...base(doc), lockId: asId(doc.properties.lockId), signature: base64.encode(asBytes(doc.properties.signature)) }),
    funding: (doc: RawDocument): Funding => ({ ...base(doc), lockId: asId(doc.properties.lockId), scriptSigs: decodeScriptSigs(asBytes(doc.properties.scriptSigs)) }),
    feeFunding: (doc: RawDocument): Funding => ({ ...base(doc), lockId: asId(doc.properties.lockId), scriptSigs: decodeScriptSigs(asBytes(doc.properties.scriptSigs)) }),
    feedback: (doc: RawDocument): Feedback => ({ ...base(doc), poolId: asId(doc.properties.poolId), rating: asNumber(doc.properties.rating), text: normalizeMultilineText(String(doc.properties.text ?? '')) }),
    message: (doc: RawDocument): Message => ({ ...base(doc), channel: normalizeDisplayText(String(doc.properties.channel)), text: normalizeMultilineText(String(doc.properties.text)) }),
    chatKey: (doc: RawDocument): ChatKey => ({ ...base(doc), lockId: asId(doc.properties.lockId), envelopes: toHex(asBytes(doc.properties.envelopes)) }),
    privateMessage: (doc: RawDocument): PrivateMessage => ({ ...base(doc), lockId: asId(doc.properties.lockId), payload: toHex(asBytes(doc.properties.payload)) }),
    vote: (doc: RawDocument): Vote => {
      const p = doc.properties
      const outcome = asNumber(p.outcome)
      if (outcome !== 1 && outcome !== 2 && outcome !== 3) throw new Error('outcome must be 1, 2 or 3')
      return { ...base(doc), poolId: asId(p.poolId), proposalHash: toHex(asBytes(p.proposalHash)), outcome }
    }
  }
  type DocumentType = keyof typeof decoders
  type Decoded<T extends DocumentType> = ReturnType<typeof decoders[T]>

  // Built from the published schema at init, so queries skip the getDataContract round-trip entirely.
  // The id is deterministic in owner + creation nonce; a different configured contract falls back to fetching.
  const localContract = new DataContractWASM(contractOwner, contractNonce, schema, undefined, undefined, true)
  localContract.version = 3 // the deployed contract version
  let fetched: Promise<DataContract> | null = null
  const dataContract = async (): Promise<DataContract> =>
    localContract.id.base58() === contractId
      ? localContract
      : await (fetched ??= sdk.dataContracts.getDataContractByIdentifier(contractId))

  async function rawPage<T extends DocumentType> (type: T, where: Where, orderBy?: OrderBy, startAfter?: string): Promise<RawDocument[]> {
    return await sdk.documents.query(await dataContract(), type, where as never, orderBy as never, PAGE, undefined, startAfter as never) as unknown as RawDocument[]
  }

  const decode = <T extends DocumentType>(type: T, docs: RawDocument[]): Array<Decoded<T>> =>
    docs.flatMap(doc => {
      try {
        return [decoders[type](doc) as Decoded<T>]
      } catch {
        return [] // not a document this app can use
      }
    })

  async function query<T extends DocumentType> (type: T, where: Where, orderBy?: OrderBy): Promise<Array<Decoded<T>>> {
    return decode(type, await rawPage(type, where, orderBy))
  }

  /** Every matching document: `startAfter` continues past the last one until a page comes back short */
  async function queryAll<T extends DocumentType> (type: T, where: Where, orderBy?: OrderBy): Promise<Array<Decoded<T>>> {
    const all: Array<Decoded<T>> = []
    let startAfter: string | undefined
    for (;;) {
      const page = await rawPage(type, where, orderBy, startAfter)
      all.push(...decode(type, page))
      if (page.length < PAGE) return all
      startAfter = page[page.length - 1].id.base58()
    }
  }

  /** Documents of one parent (pool or lock), oldest first, over a `parent + $createdAt` index */
  const byParent = async <T extends DocumentType>(type: T, field: string, id: string): Promise<Array<Decoded<T>>> =>
    await query(type, [[field, '==', id], ['$createdAt', '>', 0]], [[field, 'asc'], ['$createdAt', 'asc']])

  /** Publishes a document and waits until Platform returns it, so the next read sees it */
  async function publish<T extends DocumentType> (identity: string, type: T, data: Record<string, unknown>): Promise<Decoded<T>> {
    // Protocol v14 derives the document id from the create transition's identity nonce
    // (`generate_document_id` v1), so the nonce must be known before the document exists.
    const identityContractNonce = await sdk.identities.getIdentityContractNonce(identity, contractId) + 1n
    const document = sdk.documents.create(contractId, type, data, identity, identityContractNonce)
    await signer(sdk.documents.createStateTransition(document as any, 'create', { identityContractNonce }))

    const id = document.id.base58()
    const deadline = Date.now() + CONFIRM_TIMEOUT_MS
    for (;;) {
      const [found] = await query(type, [['$id', '==', id]])
      if (found != null) return found
      if (Date.now() > deadline) throw new Error('The document was sent but hasn’t appeared on Platform yet. Reload in a moment.')
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
  }

  const usernames = new Map<string, Promise<string | null>>()
  let queuedNames: Array<{ id: string, resolve: (name: string | null) => void }> = []
  let namesFlush: ReturnType<typeof setTimeout> | null = null

  /** DPNS indexes `records.identity`, so one `in` query resolves a whole render's worth of names */
  const fetchNames = async (ids: string[]): Promise<Map<string, string>> => {
    const names = new Map<string, string>()
    for (let i = 0; i < ids.length; i += NAME_BATCH) {
      let startAfter: string | undefined
      const chunk = ids.slice(i, i + NAME_BATCH)
      for (;;) {
        // `in` is a range predicate: the orderBy has to lead with the same field
        const page = await sdk.documents.query(DPNS_CONTRACT_ID, 'domain', [['records.identity', 'in', chunk]] as never, [['records.identity', 'asc']] as never, PAGE, undefined, startAfter as never) as unknown as RawDocument[]
        for (const doc of page) {
          const records = doc.properties.records as { identity?: unknown } | undefined
          const label = doc.properties.label
          // An identity can hold several names; the first one in index order is the one shown
          if (records?.identity != null && typeof label === 'string' && !names.has(asId(records.identity))) {
            names.set(asId(records.identity), `${normalizeDisplayText(label)}.dash`)
          }
        }
        if (page.length < PAGE) break
        startAfter = page[page.length - 1].id.base58()
      }
    }
    return names
  }

  const flushNames = (): void => {
    const batch = queuedNames
    queuedNames = []
    namesFlush = null
    // One identifier that is not a 32-byte base58 id fails the whole `in` query, so drop it here
    const usable: typeof batch = []
    for (const entry of batch) {
      let size = 0
      try {
        size = base58.decode(entry.id).length
      } catch {
        size = 0
      }
      if (size === 32) usable.push(entry)
      else entry.resolve(null)
    }
    if (usable.length === 0) return
    void fetchNames(usable.map(entry => entry.id))
      .then(names => usable.forEach(entry => entry.resolve(names.get(entry.id) ?? null)))
      .catch(() => usable.forEach(entry => entry.resolve(null)))
  }

  return {
    listPools: async () => await queryAll('pool', [['$createdAt', '>', 0]], [['$createdAt', 'desc']]),
    getPool: async id => (await query('pool', [['$id', '==', id]]))[0] ?? null,
    listPoolsByOwner: async ownerId => (await query('pool', [['$ownerId', '==', ownerId]])).sort((a, b) => b.createdAt - a.createdAt),
    listPoolsByOperatorKey: async operatorPubKey => await query(
      'pool', [['operatorPubKey', '==', fromHex(operatorPubKey)], ['$createdAt', '>', 0]], [['operatorPubKey', 'asc'], ['$createdAt', 'asc']]
    ),
    listJoins: async poolId => await byParent('join', 'poolId', poolId),
    listJoinsByOwner: async ownerId => await query('join', [['$ownerId', '==', ownerId]]),
    // `in` is a range predicate, so the orderBy has to lead with poolId (index poolId + $createdAt)
    listJoinsByPools: async poolIds => poolIds.length === 0
      ? []
      : await queryAll('join', [['poolId', 'in', poolIds]], [['poolId', 'asc'], ['$createdAt', 'asc']]),
    listLocks: async poolIds => poolIds.length === 0
      ? []
      : await queryAll('lock', [['poolId', 'in', poolIds]], [['poolId', 'asc']]),
    listConsents: async lockId => await query('consent', [['lockId', '==', lockId]]),
    listFundings: async lockId => await query('funding', [['lockId', '==', lockId]]),
    listFeeFundings: async lockId => await query('feeFunding', [['lockId', '==', lockId]]),
    listMessages: async channel => await byParent('message', 'channel', channel),
    listFeedback: async poolId => (await byParent('feedback', 'poolId', poolId)).reverse(),
    listChatKeys: async lockId => await byParent('chatKey', 'lockId', lockId),
    listPrivateMessages: async lockId => await byParent('privateMessage', 'lockId', lockId),
    // No `$createdAt > 0` range here: Drive only accepts that range when the orderBy reaches
    // $createdAt without a gap, and `poolProposal` has proposalHash in between. Every document has a
    // $createdAt anyway, so filtering on it adds nothing — verified against the v3 contract.
    listVotes: async poolId => await queryAll('vote',
      [['poolId', '==', poolId]],
      [['poolId', 'asc'], ['proposalHash', 'asc'], ['$createdAt', 'asc']]),
    listVotesByProposal: async proposalHash => await queryAll('vote',
      [['proposalHash', '==', fromHex(proposalHash)], ['$createdAt', '>', 0]],
      [['proposalHash', 'asc'], ['$createdAt', 'asc']]),
    listRecentVotes: async (limit = 100) => decode('vote',
      await sdk.documents.query(await dataContract(), 'vote', [['$createdAt', '>', 0]] as never, [['$createdAt', 'desc']] as never, limit) as unknown as RawDocument[]),
    listAllVotes: async () => await queryAll('vote', [['$createdAt', '>', 0]], [['$createdAt', 'asc']]),

    async getEncryptionKeys (identityId) {
      const keys = await sdk.identities.getIdentityPublicKeys(identityId)
      return keys
        .filter(k => k.keyType === 'ECDSA_SECP256K1' && (k.purpose === 'ENCRYPTION' || k.purpose === 'DECRYPTION') && k.disabledAt == null)
        // Prefer DECRYPTION keys: that is the key the owner decrypts with
        .sort((a, b) => Number(b.purpose === 'DECRYPTION') - Number(a.purpose === 'DECRYPTION'))
        .map(k => ({ id: k.keyId, publicKey: k.data }))
    },

    async getUsername (identityId) {
      if (identityId === '') return null
      let pending = usernames.get(identityId)
      if (pending == null) {
        // Chips render together, so their lookups coalesce into one DPNS query per tick
        pending = new Promise<string | null>(resolve => {
          queuedNames.push({ id: identityId, resolve })
          if (namesFlush == null) namesFlush = setTimeout(flushNames, 0)
        })
        usernames.set(identityId, pending)
      }
      return await pending
    },

    // Optional contract fields are left out when empty: Platform rejects null for a typed field
    createPool: async (identity, pool) => await publish(identity, 'pool', {
      name: pool.name,
      description: pool.description,
      ...(pool.service != null && pool.service !== '' ? { service: pool.service } : {}),
      ...(pool.location != null ? { location: pool.location } : {}),
      operatorPubKey: fromHex(pool.operatorPubKey),
      votingKeyId: addressToKeyId(pool.votingAddress, network),
      operatorReward: pool.operatorReward,
      earlyPeriodBlocks: pool.earlyPeriodBlocks,
      earlyPenalty: pool.earlyPenalty,
      fee: pool.fee,
      ...(pool.feePayer != null ? { feePayer: pool.feePayer } : {})
    }),
    createJoin: async (identity, join) => await publish(identity, 'join', {
      poolId: idBytes(join.poolId),
      amount: join.amount,
      refundScript: addressToScript(join.refundAddress, network),
      ...(join.rewardAddress != null ? { rewardScript: addressToScript(join.rewardAddress, network) } : {}),
      ownerKeyId: addressToKeyId(join.ownerAddress, network),
      inputs: encodeOutpoints(join.inputs),
      changeScript: addressToScript(join.changeAddress, network),
      ...(join.encryptionKeyId != null ? { encryptionKeyId: join.encryptionKeyId } : {})
    }),
    createLock: async (identity, lock) => {
      const data: Record<string, unknown> = { poolId: idBytes(lock.poolId), joinIds: concatBytes(...lock.joinIds.map(idBytes)) }
      if (lock.feeInputs != null && lock.feeInputs.length > 0) data.feeInputs = encodeOutpoints(lock.feeInputs)
      if (lock.feeChangeAddress != null && lock.feeChangeAddress !== '') data.feeChangeAddress = lock.feeChangeAddress
      return await publish(identity, 'lock', data)
    },
    createConsent: async (identity, consent) => await publish(identity, 'consent', {
      lockId: idBytes(consent.lockId), signature: base64.decode(consent.signature)
    }),
    createFunding: async (identity, funding) => await publish(identity, 'funding', {
      lockId: idBytes(funding.lockId), scriptSigs: encodeScriptSigs(funding.scriptSigs)
    }),
    createFeeFunding: async (identity, funding) => await publish(identity, 'feeFunding', {
      lockId: idBytes(funding.lockId), scriptSigs: encodeScriptSigs(funding.scriptSigs)
    }),
    sendMessage: async (identity, message) => await publish(identity, 'message', { channel: message.channel, text: message.text }),
    createFeedback: async (identity, feedback) => await publish(identity, 'feedback', {
      poolId: idBytes(feedback.poolId), rating: feedback.rating, text: feedback.text
    }),
    createChatKey: async (identity, chatKey) => await publish(identity, 'chatKey', {
      lockId: idBytes(chatKey.lockId), envelopes: fromHex(chatKey.envelopes)
    }),
    sendPrivateMessage: async (identity, message) => await publish(identity, 'privateMessage', {
      lockId: idBytes(message.lockId), payload: fromHex(message.payload)
    }),
    createVote: async (identity, vote) => await publish(identity, 'vote', {
      poolId: idBytes(vote.poolId), proposalHash: fromHex(vote.proposalHash), outcome: vote.outcome
    })
  }
}
