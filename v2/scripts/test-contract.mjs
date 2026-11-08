// Exercises the deployed contract on testnet: one document of every type, the rules Platform must
// enforce (unique indices, enum, immutability, no deletion), and the queries the app relies on.
// Usage: node scripts/test-contract.mjs      (costs a small amount of credits)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { IdentifierWASM } from 'pshenmic-dpp'
import { identityId, sdk, signAndBroadcast } from './env.mjs'

const contractId = /VITE_CONTRACT_ID=(\S+)/.exec(readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8'))[1]
const bytes = (n, seed = 0) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + n + seed) % 256)
const idBytes = base58 => new IdentifierWASM(base58).bytes()
const DASH = 100_000_000

let failures = 0
const check = (ok, label, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail !== '' ? '  — ' + detail : ''}`); if (!ok) failures++ }
const short = e => String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 150)

async function transition (document, kind) {
  const identityContractNonce = await sdk.identities.getIdentityContractNonce(identityId, contractId) + 1n
  await signAndBroadcast(sdk.documents.createStateTransition(document, kind, { identityContractNonce }))
}

/** Creates a document; returns its id, or null with the rejection reason */
async function put (type, data) {
  const document = sdk.documents.create(contractId, type, data, identityId)
  try {
    await transition(document, 'create')
    return { id: document.id.base58(), document }
  } catch (e) {
    return { id: null, error: short(e) }
  }
}
const accepted = async (label, type, data) => { const r = await put(type, data); check(r.id != null, `create ${label}`, r.error ?? r.id); return r }
const rejected = async (label, type, data) => { const r = await put(type, data); check(r.id == null, `reject ${label}`, r.error ?? 'was ACCEPTED: ' + r.id) }
const query = async (type, where, orderBy) => await sdk.documents.query(contractId, type, where, orderBy, 100)

const balanceBefore = await sdk.identities.getIdentityBalance(identityId)
const run = Date.now().toString(36)
const operatorKey = bytes(48, Number(BigInt(Date.now()) % 200n))
const poolTerms = { name: `Test ${run}`, description: 'contract test', operatorPubKey: operatorKey, votingKeyId: bytes(20), operatorReward: 500, earlyPeriodBlocks: 17280, earlyPenalty: 5 * DASH, fee: 20000 }

console.log('— documents of every type')
const pool = await accepted('pool (with location, no service)', 'pool', { ...poolTerms, location: 'DE' })
const pool2 = await accepted('pool (worldwide, with service, same operator key)', 'pool', { ...poolTerms, name: `Test ${run} b`, service: '203.0.113.10:19999' })
const poolId = idBytes(pool.id)
const joinData = { poolId, amount: 250 * DASH, refundScript: bytes(25, 1), ownerKeyId: bytes(20, 2), inputs: bytes(36, 3), changeScript: bytes(25, 4), encryptionKeyId: 4 }
const join = await accepted('join (with encryptionKeyId)', 'join', joinData)
const lock = await accepted('lock', 'lock', { poolId, joinIds: new Uint8Array([...idBytes(join.id), ...idBytes(join.id)]) })
const lockId = idBytes(lock.id)
await accepted('consent', 'consent', { lockId, signature: bytes(65, 5) })
await accepted('funding', 'funding', { lockId, scriptSigs: bytes(108, 6) })
await accepted('feedback', 'feedback', { poolId, rating: 5, text: 'works' })
await accepted('message', 'message', { channel: pool.id, text: 'hello' })
await accepted('chatKey', 'chatKey', { lockId, envelopes: bytes(94 * 2, 7) })
await accepted('privateMessage', 'privateMessage', { lockId, payload: bytes(60, 8) })

console.log('— rules Platform must enforce')
await rejected('second join by the same identity in the pool (unique poolId + $ownerId)', 'join', { ...joinData, amount: 300 * DASH })
// Optional fields must be left out: the SDK serializes undefined as null, which the schema rejects
const { encryptionKeyId: _omitted, ...joinWithoutKey } = joinData
await accepted('join by the same identity in ANOTHER pool, without encryptionKeyId', 'join', { ...joinWithoutKey, poolId: idBytes(pool2.id) })
await rejected('second lock of the pool by its owner (unique poolId + $ownerId)', 'lock', { poolId, joinIds: bytes(64, 9) })
await rejected('pool with an unknown location code', 'pool', { ...poolTerms, name: 'bad', location: 'ZZ' })
await rejected('pool with operatorReward above 10000', 'pool', { ...poolTerms, name: 'bad', operatorReward: 10001 })
await rejected('pool with a 47-byte operator key', 'pool', { ...poolTerms, name: 'bad', operatorPubKey: bytes(47) })
await rejected('pool with an unknown field', 'pool', { ...poolTerms, name: 'bad', status: 'ACTIVE' })
await rejected('join below 100 DASH', 'join', { ...joinData, poolId: idBytes(pool2.id), amount: 99 * DASH })
await rejected('feedback rating 6', 'feedback', { poolId, rating: 6, text: 'x' })
await rejected('consent with a 64-byte signature', 'consent', { lockId, signature: bytes(64) })

console.log('— immutability')
try {
  pool.document.properties = { ...pool.document.properties, name: 'changed' }
  pool.document.revision = 2n
  await transition(pool.document, 'replace')
  check(false, 'reject replacing a pool', 'was ACCEPTED')
} catch (e) { check(true, 'reject replacing a pool', short(e)) }
try {
  await transition(join.document, 'delete')
  check(false, 'reject deleting a join', 'was ACCEPTED')
} catch (e) { check(true, 'reject deleting a join', short(e)) }

console.log('— queries the app relies on')
const q = async (label, type, where, orderBy, expect) => {
  try {
    const docs = await query(type, where, orderBy)
    check(expect(docs), `query ${label}`, `${docs.length} found`)
  } catch (e) { check(false, `query ${label}`, short(e)) }
}
const has = id => docs => docs.some(d => d.id.base58() === id)
await q('pools by $ownerId', 'pool', [['$ownerId', '==', identityId]], undefined, has(pool.id))
await q('pools newest first ($createdAt)', 'pool', [['$createdAt', '>', 0]], [['$createdAt', 'desc']], has(pool.id))
await q('pools by operatorPubKey (both pools on the key)', 'pool', [['operatorPubKey', '==', operatorKey]], undefined, docs => has(pool.id)(docs) && has(pool2.id)(docs))
await q('joins of a pool, oldest first', 'join', [['poolId', '==', pool.id], ['$createdAt', '>', 0]], [['poolId', 'asc'], ['$createdAt', 'asc']], has(join.id))
await q('the join of one identity in a pool', 'join', [['poolId', '==', pool.id], ['$ownerId', '==', identityId]], undefined, docs => docs.length === 1)
await q('joins by $ownerId (dashboard)', 'join', [['$ownerId', '==', identityId]], undefined, docs => docs.length >= 2)
await q('lock of a pool by its owner', 'lock', [['poolId', '==', pool.id], ['$ownerId', '==', identityId]], undefined, docs => docs.length === 1)
await q('consents of a lock by member', 'consent', [['lockId', '==', lock.id], ['$ownerId', '==', identityId]], undefined, docs => docs.length === 1)
await q('fundings of a lock by member', 'funding', [['lockId', '==', lock.id], ['$ownerId', '==', identityId]], undefined, docs => docs.length === 1)
await q('feedback of a pool', 'feedback', [['poolId', '==', pool.id], ['$createdAt', '>', 0]], [['poolId', 'asc'], ['$createdAt', 'asc']], docs => docs.length === 1)
await q('messages of a channel, in order', 'message', [['channel', '==', pool.id], ['$createdAt', '>', 0]], [['channel', 'asc'], ['$createdAt', 'asc']], docs => docs.length === 1)
await q('chat keys of a lock, oldest first', 'chatKey', [['lockId', '==', lock.id], ['$createdAt', '>', 0]], [['lockId', 'asc'], ['$createdAt', 'asc']], docs => docs.length === 1)
await q('private messages of a lock, in order', 'privateMessage', [['lockId', '==', lock.id], ['$createdAt', '>', 0]], [['lockId', 'asc'], ['$createdAt', 'asc']], docs => docs.length === 1)

const stored = (await query('join', [['poolId', '==', pool.id], ['$ownerId', '==', identityId]]))[0]
check(Number(stored.properties.amount) === 250 * DASH && Number(stored.properties.encryptionKeyId) === 4, 'stored join keeps amount and encryptionKeyId')

const spent = balanceBefore - await sdk.identities.getIdentityBalance(identityId)
console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}. spent ${Number(spent) / 1e11} DASH`)
process.exit(failures === 0 ? 0 : 1)
