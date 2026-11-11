import { base58, base64 } from '@scure/base'
import type { DashPlatformSDK } from 'dash-platform-sdk'
import { addressToKeyId, addressToScript, keyIdToAddress, scriptToAddress } from '../../lib/address'
import { ByteReader, compactSize, concatBytes, fromHex, toHex } from '../../lib/bytes'
import { isCountryCode } from '../../lib/countries'
import type {
  ChatKey, Consent, Feedback, Funding, Join, Lock, Message, Network, Outpoint, Pool, PrivateMessage
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

interface RawDocument {
  id: { base58: () => string }
  ownerId: { base58: () => string }
  createdAt?: bigint
  properties: Record<string, unknown>
}

type Where = Array<[string, string, unknown]>
type OrderBy = Array<[string, 'asc' | 'desc']>

const PAGE = 100
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
        name: String(p.name),
        description: String(p.description ?? ''),
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
    feedback: (doc: RawDocument): Feedback => ({ ...base(doc), poolId: asId(doc.properties.poolId), rating: asNumber(doc.properties.rating), text: String(doc.properties.text ?? '') }),
    message: (doc: RawDocument): Message => ({ ...base(doc), channel: String(doc.properties.channel), text: String(doc.properties.text) }),
    chatKey: (doc: RawDocument): ChatKey => ({ ...base(doc), lockId: asId(doc.properties.lockId), envelopes: toHex(asBytes(doc.properties.envelopes)) }),
    privateMessage: (doc: RawDocument): PrivateMessage => ({ ...base(doc), lockId: asId(doc.properties.lockId), payload: toHex(asBytes(doc.properties.payload)) })
  }
  type DocumentType = keyof typeof decoders
  type Decoded<T extends DocumentType> = ReturnType<typeof decoders[T]>

  async function query<T extends DocumentType> (type: T, where: Where, orderBy?: OrderBy): Promise<Array<Decoded<T>>> {
    const docs = await sdk.documents.query(contractId, type, where as never, orderBy as never, PAGE) as unknown as RawDocument[]
    return docs.flatMap(doc => {
      try {
        return [decoders[type](doc) as Decoded<T>]
      } catch {
        return [] // not a document this app can use
      }
    })
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

  return {
    listPools: async () => await query('pool', [['$createdAt', '>', 0]], [['$createdAt', 'desc']]),
    getPool: async id => (await query('pool', [['$id', '==', id]]))[0] ?? null,
    listPoolsByOwner: async ownerId => (await query('pool', [['$ownerId', '==', ownerId]])).sort((a, b) => b.createdAt - a.createdAt),
    listPoolsByOperatorKey: async operatorPubKey => await query(
      'pool', [['operatorPubKey', '==', fromHex(operatorPubKey)], ['$createdAt', '>', 0]], [['operatorPubKey', 'asc'], ['$createdAt', 'asc']]
    ),
    listJoins: async poolId => await byParent('join', 'poolId', poolId),
    listJoinsByOwner: async ownerId => await query('join', [['$ownerId', '==', ownerId]]),
    listLocks: async poolIds => (await Promise.all(poolIds.map(async id => await query('lock', [['poolId', '==', id]])))).flat(),
    listConsents: async lockId => await query('consent', [['lockId', '==', lockId]]),
    listFundings: async lockId => await query('funding', [['lockId', '==', lockId]]),
    listFeeFundings: async lockId => await query('feeFunding', [['lockId', '==', lockId]]),
    listMessages: async channel => await byParent('message', 'channel', channel),
    listFeedback: async poolId => (await byParent('feedback', 'poolId', poolId)).reverse(),
    listChatKeys: async lockId => await byParent('chatKey', 'lockId', lockId),
    listPrivateMessages: async lockId => await byParent('privateMessage', 'lockId', lockId),

    async getEncryptionKeys (identityId) {
      const keys = await sdk.identities.getIdentityPublicKeys(identityId)
      return keys
        .filter(k => k.keyType === 'ECDSA_SECP256K1' && (k.purpose === 'ENCRYPTION' || k.purpose === 'DECRYPTION') && k.disabledAt == null)
        // Prefer DECRYPTION keys: that is the key the owner decrypts with
        .sort((a, b) => Number(b.purpose === 'DECRYPTION') - Number(a.purpose === 'DECRYPTION'))
        .map(k => ({ id: k.keyId, publicKey: k.data }))
    },

    async getUsername (identityId) {
      let pending = usernames.get(identityId)
      if (pending == null) {
        pending = sdk.names.searchByIdentity(identityId)
          .then(docs => {
            const label = (docs[0] as unknown as RawDocument | undefined)?.properties.label
            return typeof label === 'string' ? `${label}.dash` : null
          })
          .catch(() => null)
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
    })
  }
}
