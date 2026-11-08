import { BLOCK_TIME_SECONDS } from '../../lib/consensus'
import type { BaseDocument, Outpoint, Pool } from '../../lib/types'
import { outpointKey, type Backend, type ChainSource, type NewDocument, type PlatformSource } from '../types'
import { createFixtures, MOCK_STATE_VERSION, type MockState } from './fixtures'
import { mockChatCrypto, mockEncryptionKey } from './mockChat'
import { randomBase58, seededRandom } from './mockHash'
import { MOCK_DISSOLVE_PREFIX, MOCK_REGISTRATION_PREFIX, mockTxBuilder } from './mockTxBuilder'

/*
 * In-memory Platform + DAPI stand-in. State is kept in localStorage so flows survive reloads;
 * Settings → "Clear the sandbox" empties it again.
 */

const STORAGE_KEY = 'dts:mock-state'
/** How long a broadcast mock transaction stays in the mempool */
const MEMPOOL_MS = 8_000

function load (): MockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw != null) {
      const parsed = JSON.parse(raw) as MockState
      if (parsed.version === MOCK_STATE_VERSION) return parsed
    }
  } catch {
    // Storage unavailable or corrupted: start with an empty sandbox
  }
  return createFixtures()
}

let state = load()

function save (): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage unavailable: state lives for this page only
  }
}

export function resetMockState (): void {
  state = createFixtures()
  save()
}

/** Makes a made-up UTXO exist on the mock chain, for "Fill with mock data" */
export function mockRegisterOutput (outpoint: Outpoint, value: number): void {
  state.chain.outputs[outpointKey(outpoint)] = value
  save()
}

export function mockUsernames (): Record<string, string> {
  return state.usernames
}

const latency = async (): Promise<void> => await new Promise(resolve => setTimeout(resolve, 120 + Math.random() * 200))

const idRandom = seededRandom(Date.now() % 2 ** 31)

function create<T extends BaseDocument> (collection: T[], identity: string, data: NewDocument<T>): T {
  const doc = { ...data, id: randomBase58(idRandom, 44), ownerId: identity, createdAt: Date.now() } as T
  collection.push(doc)
  save()
  return doc
}

function currentHeight (): number {
  return state.baseHeight + Math.floor((Date.now() - state.createdAt) / (BLOCK_TIME_SECONDS * 1000))
}

/** Mines mempool transactions whose time has come; a mined registration enters the masternode list */
function settleMempool (): void {
  let changed = false
  for (const [txid, until] of Object.entries(state.chain.pendingUntil)) {
    if (Date.now() < until) continue
    state.chain.txHeights[txid] = currentHeight()
    delete state.chain.pendingUntil[txid]
    changed = true
  }
  if (changed) save()
}

const platform: PlatformSource = {
  async listPools () {
    await latency()
    return [...state.pools].sort((a, b) => b.createdAt - a.createdAt)
  },
  async getPool (id) {
    await latency()
    return state.pools.find(p => p.id === id) ?? null
  },
  async listPoolsByOwner (ownerId) {
    await latency()
    return state.pools.filter(p => p.ownerId === ownerId).sort((a, b) => b.createdAt - a.createdAt)
  },
  async listPoolsByOperatorKey (operatorPubKey) {
    await latency()
    const key = operatorPubKey.toLowerCase()
    return state.pools.filter(p => p.operatorPubKey.toLowerCase() === key).sort((a, b) => a.createdAt - b.createdAt)
  },
  async listJoins (poolId) {
    await latency()
    return state.joins.filter(j => j.poolId === poolId).sort((a, b) => a.createdAt - b.createdAt)
  },
  async listJoinsByOwner (ownerId) {
    await latency()
    return state.joins.filter(j => j.ownerId === ownerId)
  },
  async listLocks (poolIds) {
    await latency()
    const ids = new Set(poolIds)
    return state.locks.filter(l => ids.has(l.poolId))
  },
  async listConsents (lockId) {
    await latency()
    return state.consents.filter(c => c.lockId === lockId)
  },
  async listFundings (lockId) {
    await latency()
    return state.fundings.filter(f => f.lockId === lockId)
  },
  async listMessages (channel) {
    await latency()
    return state.messages.filter(m => m.channel === channel).sort((a, b) => a.createdAt - b.createdAt)
  },
  async listFeedback (poolId) {
    await latency()
    return state.feedback.filter(f => f.poolId === poolId).sort((a, b) => b.createdAt - a.createdAt)
  },
  async listChatKeys (lockId) {
    await latency()
    return state.chatKeys.filter(k => k.lockId === lockId).sort((a, b) => a.createdAt - b.createdAt)
  },
  async listPrivateMessages (lockId) {
    await latency()
    return state.privateMessages.filter(m => m.lockId === lockId).sort((a, b) => a.createdAt - b.createdAt)
  },
  async getEncryptionKeys (identityId) {
    await latency()
    return state.noEncryptionKey.includes(identityId) ? [] : [mockEncryptionKey(identityId)]
  },
  async getUsername (identityId) {
    return state.usernames[identityId] ?? null
  },

  async createPool (identity, data) {
    await latency()
    return create<Pool>(state.pools, identity, data)
  },
  async createJoin (identity, data) {
    await latency()
    // Platform enforces the unique index poolId + $ownerId
    if (state.joins.some(j => j.poolId === data.poolId && j.ownerId === identity)) {
      throw new Error('You already joined this pool')
    }
    return create(state.joins, identity, data)
  },
  async createLock (identity, data) {
    await latency()
    if (state.locks.some(l => l.poolId === data.poolId && l.ownerId === identity)) {
      throw new Error('This pool is already locked')
    }
    return create(state.locks, identity, data)
  },
  async createConsent (identity, data) {
    await latency()
    return create(state.consents, identity, data)
  },
  async createFunding (identity, data) {
    await latency()
    return create(state.fundings, identity, data)
  },
  async sendMessage (identity, data) {
    await latency()
    return create(state.messages, identity, data)
  },
  async createFeedback (identity, data) {
    await latency()
    return create(state.feedback, identity, data)
  },
  async createChatKey (identity, data) {
    await latency()
    return create(state.chatKeys, identity, data)
  },
  async sendPrivateMessage (identity, data) {
    await latency()
    return create(state.privateMessages, identity, data)
  }
}

const chain: ChainSource = {
  async getBestBlockHeight () {
    return currentHeight()
  },
  async getTransaction (txid) {
    await latency()
    settleMempool()
    if (txid in state.chain.pendingUntil) return { txid, height: null }
    const height = state.chain.txHeights[txid]
    return height === undefined ? null : { txid, height }
  },
  async getOutputValue (outpoint) {
    await latency()
    return state.chain.outputs[outpointKey(outpoint)] ?? null
  },
  async getPrevout (outpoint) {
    await latency()
    const value = state.chain.outputs[outpointKey(outpoint)]
    if (value == null) return null
    return { script: '76a914' + '11'.repeat(20) + '88ac', value }
  },
  async getMasternode (proTxHash) {
    await latency()
    settleMempool()
    const mn = state.chain.masternodes[proTxHash]
    if (mn == null) return null
    // A registration still in the mempool is not in the list yet
    if (proTxHash in state.chain.pendingUntil) return null
    return { proTxHash, isValid: mn.isValid, service: mn.service }
  },
  async getMasternodeByOperatorKey (operatorPubKey) {
    await latency()
    settleMempool()
    const key = operatorPubKey.toLowerCase()
    const found = Object.entries(state.chain.masternodes)
      .find(([txid, mn]) => mn.operatorPubKey.toLowerCase() === key && !(txid in state.chain.pendingUntil))
    return found == null ? null : { proTxHash: found[0], isValid: found[1].isValid, service: found[1].service }
  },
  async getRegisteredHeight (proTxHash) {
    settleMempool()
    return state.chain.txHeights[proTxHash] ?? null
  },
  // The mock always has a complete masternode list for the current block
  async getMasternodeListHeight () {
    return currentHeight()
  },
  async broadcastTransaction (hex) {
    await latency()
    const value = hex.trim().toLowerCase()
    if (value.startsWith(MOCK_REGISTRATION_PREFIX)) {
      const txid = value.slice(MOCK_REGISTRATION_PREFIX.length, MOCK_REGISTRATION_PREFIX.length + 64)
      if (state.chain.txHeights[txid] !== undefined || txid in state.chain.pendingUntil) {
        throw new Error('txn-already-known')
      }
      state.chain.pendingUntil[txid] = Date.now() + MEMPOOL_MS
      const pool = findPoolByProTxHash(txid)
      // Registered without an address, a masternode starts PoSe-banned until a ProUpServTx
      const service = pool?.service ?? ''
      state.chain.masternodes[txid] = { isValid: service !== '', service, operatorPubKey: pool?.operatorPubKey ?? '' }
      save()
      return txid
    }
    if (value.startsWith(MOCK_DISSOLVE_PREFIX)) {
      const proTxHash = value.slice(MOCK_DISSOLVE_PREFIX.length, MOCK_DISSOLVE_PREFIX.length + 64)
      if (state.chain.masternodes[proTxHash] == null) throw new Error('bad-prodis-hash')
      delete state.chain.masternodes[proTxHash]
      save()
      return value.slice(0, 64)
    }
    throw new Error('Mock network: this is not a transaction the mock chain knows. Use "Fill with mock data".')
  }
}

function findPoolByProTxHash (txid: string): Pool | null {
  for (const lock of state.locks) {
    const pool = state.pools.find(p => p.id === lock.poolId)
    if (pool == null) continue
    const members = lock.joinIds.map(id => state.joins.find(j => j.id === id)).filter(j => j != null)
    const tx = mockTxBuilder.buildRegistration(pool, members, new Map())
    if (mockTxBuilder.combine(tx, [], []).txid === txid) return pool
  }
  return null
}

export const mockBackend: Backend = {
  mode: 'mock',
  features: { registration: true, privateChat: true },
  platform,
  chain,
  tx: mockTxBuilder,
  chat: mockChatCrypto
}
