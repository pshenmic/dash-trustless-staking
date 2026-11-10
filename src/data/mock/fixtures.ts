import type { ChatKey, Consent, Feedback, Funding, Join, Lock, Message, Pool, PrivateMessage } from '../../lib/types'
import { randomBase58, seededRandom } from './mockHash'

export interface MockChainState {
  /** txid → block height, or null while in the mempool */
  txHeights: Record<string, number | null>
  /** txid → timestamp when a mempool tx gets mined */
  pendingUntil: Record<string, number>
  masternodes: Record<string, { isValid: boolean, service: string, operatorPubKey: string }>
  outputs: Record<string, number>
}

export interface MockState {
  version: number
  createdAt: number
  baseHeight: number
  pools: Pool[]
  joins: Join[]
  locks: Lock[]
  consents: Consent[]
  fundings: Funding[]
  messages: Message[]
  feedback: Feedback[]
  chatKeys: ChatKey[]
  privateMessages: PrivateMessage[]
  /** Identities without an encryption key: they can join, but not read private chats */
  noEncryptionKey: string[]
  usernames: Record<string, string>
  chain: MockChainState
}

export const MOCK_STATE_VERSION = 10

const NAMES = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'grace', 'heidi', 'ivan', 'judy', 'nodeops', 'oscar'] as const

/**
 * The mock sandbox starts empty: no pools. It only has a set of made-up identities to act as
 * (Settings → View as), so the whole flow, including registration, can be tried by hand before
 * Dash Core v24 is live. Real pools come from the testnet backend.
 */
export function createFixtures (now = Date.now()): MockState {
  const random = seededRandom(20260930)
  const identities = Object.fromEntries(NAMES.map(n => [n, randomBase58(random, 44)])) as Record<typeof NAMES[number], string>

  return {
    version: MOCK_STATE_VERSION,
    createdAt: now,
    baseHeight: 1_312_400,
    pools: [],
    joins: [],
    locks: [],
    consents: [],
    fundings: [],
    messages: [],
    feedback: [],
    chatKeys: [],
    privateMessages: [],
    // Two identities without an encryption key, to try the "joined without a key" case
    noEncryptionKey: [identities.frank, identities.oscar],
    usernames: Object.fromEntries(NAMES.map(n => [identities[n], `${n}.dash`])),
    chain: { txHeights: {}, pendingUntil: {}, masternodes: {}, outputs: {} }
  }
}
