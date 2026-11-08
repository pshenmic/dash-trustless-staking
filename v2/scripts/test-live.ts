// Checks the app's live Platform source (src/data/live) against testnet with the test identity:
// creates a pool and a join through the same code the app uses, then reads them back.
// Usage: npm run test:live      (costs a small amount of credits)
import { sha256 } from '@noble/hashes/sha256'
import { createTestnetBackend } from '../src/data/live'
import { encodeAddress } from '../src/lib/address'
import { toHex } from '../src/lib/bytes'
// @ts-expect-error plain JS helper shared with the other scripts
import { identityId, privateKey, sdk, signingKey } from './env.mjs'

const CONTRACT_ID = process.env.VITE_CONTRACT_ID as string
const signer = async (stateTransition: any): Promise<void> => {
  stateTransition.sign(privateKey, await signingKey())
  await sdk.stateTransitions.broadcast(stateTransition)
}
const { platform, chain } = createTestnetBackend(CONTRACT_ID, signer)

let failures = 0
const check = (ok: boolean, label: string, detail = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail !== '' ? '  — ' + detail : ''}`); if (!ok) failures++ }
const run = Date.now().toString(36)
// Fresh, valid testnet addresses derived from the run id (nobody holds their keys: test data only)
const addr = (label: string, type: 'p2pkh' | 'p2sh' = 'p2pkh'): string => encodeAddress(sha256(new TextEncoder().encode(run + label)).slice(0, 20), type, 'testnet')

// A real, confirmed testnet output to use as the join's UTXO
const tip = await (await fetch('https://insight.testnet.networks.dash.org/insight-api/blocks?limit=1')).json()
const block = await (await fetch(`https://insight.testnet.networks.dash.org/insight-api/block/${tip.blocks[0].hash as string}`)).json()
const utxo = { txid: block.tx[0] as string, vout: 0 }
const insightTx = await (await fetch(`https://insight.testnet.networks.dash.org/insight-api/tx/${utxo.txid}`)).json()

console.log('— chain (DAPI Core)')
const height = await chain.getBestBlockHeight()
check(height >= tip.blocks[0].height, 'best block height', String(height))
const value = await chain.getOutputValue(utxo)
check(value === Math.round(Number(insightTx.vout[0].value) * 1e8), 'output value matches Insight', `${String(value)} duffs`)
check(await chain.getOutputValue({ txid: 'ab'.repeat(32), vout: 0 }) == null, 'unknown transaction gives no value')
check(await chain.getOutputValue({ txid: utxo.txid, vout: 99 }) == null, 'missing output index gives no value')
check((await chain.getTransaction(utxo.txid))?.height === tip.blocks[0].height, 'transaction height')

console.log('— pool')
const operatorPubKey = toHex(sha256(new TextEncoder().encode(run + 'op1'))) + toHex(sha256(new TextEncoder().encode(run + 'op2'))).slice(0, 32)
const terms = {
  name: `Live test ${run}`, description: 'Created by test-live', location: 'FI', operatorPubKey,
  votingAddress: addr('vote'), operatorReward: 400, earlyPeriodBlocks: 17280, earlyPenalty: 500000000, fee: 20000
}
const pool = await platform.createPool(identityId, terms)
check(pool.ownerId === identityId && pool.createdAt > 0, 'pool created', pool.id)
check(Object.entries(terms).every(([k, v]) => (pool as any)[k] === v) && pool.service === undefined, 'pool reads back exactly as written (address, key, location; no service)')
check((await platform.getPool(pool.id))?.name === terms.name, 'getPool')
check((await platform.listPools())[0]?.id === pool.id, 'listPools: newest first')
check((await platform.listPoolsByOwner(identityId)).some(p => p.id === pool.id), 'listPoolsByOwner')
check((await platform.listPoolsByOperatorKey(operatorPubKey.toUpperCase())).map(p => p.id).join() === pool.id, 'listPoolsByOperatorKey')
check(await platform.getPool('11111111111111111111111111111111') == null, 'unknown pool id gives null')

console.log('— join')
const joinData = {
  poolId: pool.id, amount: 250_00000000, ownerAddress: addr('owner'), refundAddress: addr('refund', 'p2sh'),
  rewardAddress: addr('reward'), inputs: [utxo, { txid: 'cd'.repeat(32), vout: 7 }], changeAddress: addr('change'), encryptionKeyId: 4
}
const join = await platform.createJoin(identityId, joinData)
check(join.ownerId === identityId, 'join created', join.id)
check(JSON.stringify({ ...joinData }) === JSON.stringify(Object.fromEntries(Object.keys(joinData).map(k => [k, (join as any)[k]]))), 'join reads back exactly as written (P2SH refund, outpoints, key id)')
check((await platform.listJoins(pool.id)).map(j => j.id).join() === join.id, 'listJoins')
check((await platform.listJoinsByOwner(identityId)).some(j => j.id === join.id), 'listJoinsByOwner')
let duplicate = false
try { await platform.createJoin(identityId, joinData) } catch { duplicate = true }
check(duplicate, 'second join in the pool is rejected by Platform')
check((await platform.listLocks([pool.id])).length === 0, 'no lock yet')

console.log('— identity')
const keys = await platform.getEncryptionKeys(identityId)
check(keys.length === 2 && keys[0].id === 4 && /^0[23][0-9a-f]{64}$/.test(keys[0].publicKey), 'encryption keys, DECRYPTION key first', keys.map(k => k.id).join(','))
check(await platform.getUsername(identityId) == null, 'identity without a DPNS name has no username')

console.log('— chat')
const message = await platform.sendMessage(identityId, { channel: pool.id, text: 'hello from test-live' })
check((await platform.listMessages(pool.id)).map(m => m.text).join() === 'hello from test-live' && message.channel === pool.id, 'message written and listed')

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}  pool ${pool.id}`)
process.exit(failures === 0 ? 0 : 1)
