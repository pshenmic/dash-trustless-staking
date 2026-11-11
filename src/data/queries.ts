import { COLLATERAL, MIN_SHARES } from '../lib/consensus'
import { joinProblems, selectionProblems } from '../lib/rules'
import { finalTxProblems } from '../lib/preflight'
import { clearDissolution, pendingDissolution } from '../lib/pendingDissolution'
import {
  derivePoolStatus, findPoolLock, listStatus, lockMembers, memberDocument, signingStage, type SigningStage
} from '../lib/status'
import type {
  ChainTx, Consent, Duffs, Feedback, Funding, Join, Lock, MasternodeEntry, Outpoint, Pool, PoolListStatus, PoolStatus, Prevout
} from '../lib/types'
import { backend } from './index'
import { outpointKey, type RegistrationTx } from './types'

const { platform, chain, tx: txBuilder } = backend

export interface PoolSummary {
  pool: Pool
  lock: Lock | null
  listStatus: PoolListStatus
  joinCount: number
  joinedTotal: Duffs
}

/** Everything the pools list needs, from Platform only */
export async function fetchPoolSummaries (): Promise<PoolSummary[]> {
  const pools = await platform.listPools()
  const [locks, joinLists] = await Promise.all([
    platform.listLocks(pools.map(p => p.id)),
    Promise.all(pools.map(async p => await platform.listJoins(p.id)))
  ])
  return pools.map((pool, i) => {
    const lock = findPoolLock(pool, locks)
    const joins = joinLists[i].filter(j => joinProblems(j, pool).length === 0)
    const counted = lock == null ? joins : joins.filter(j => lock.joinIds.includes(j.id))
    return {
      pool,
      lock,
      listStatus: listStatus(lock),
      joinCount: counted.length,
      joinedTotal: counted.reduce((s, j) => s + j.amount, 0)
    }
  })
}

export interface MemberState {
  join: Join
  shareIndex: number
  consent: Consent | null
  funding: Funding | null
}

export interface PoolState {
  pool: Pool
  /** Valid joins, oldest first */
  joins: Join[]
  lock: Lock | null
  /** Lock members in share order (only when a lock exists) */
  members: MemberState[]
  /** The creator's fee signatures, when the creator pays the registration fee */
  feeFunding: Funding | null
  /** Why the lock can never form, if it can't */
  lockProblems: string[]
  registration: RegistrationTx | null
  /** Final signed tx, once every consent and funding is in */
  finalTx: { hex: string, txid: string } | null
  regTx: ChainTx | null
  masternode: MasternodeEntry | null
  registeredHeight: number | null
  height: number
  status: PoolStatus
  /** The dissolution this browser broadcast, until the chainlocked list catches up */
  dissolutionTxid: string | null
  stage: SigningStage | null
  consentCount: number
  fundingCount: number
  /** Before registration: who else uses this pool's operator key */
  operatorKey: OperatorKeyUsage
  /** Prevout scripts and values of every member input, for checking and making funding signatures */
  prevouts: Map<string, Prevout | null>
  /** Blocks broadcasting: unsigned inputs, wrong collateral, uncovered outputs */
  broadcastProblems: string[]
}

export interface OperatorKeyUsage {
  /** A masternode already holding the key: this pool's registration would be rejected */
  masternode: MasternodeEntry | null
  /** Other pools using the key; only one of them can ever register */
  otherPools: Pool[]
}

/** Where an operator key is already used, excluding one pool (and its own masternode) */
export async function fetchOperatorKeyUsage (operatorPubKey: string, excludePoolId?: string, ownProTxHash?: string): Promise<OperatorKeyUsage> {
  const [masternode, pools] = await Promise.all([
    chain.getMasternodeByOperatorKey(operatorPubKey),
    platform.listPoolsByOperatorKey(operatorPubKey)
  ])
  return {
    masternode: masternode != null && masternode.proTxHash !== ownProTxHash ? masternode : null,
    otherPools: pools.filter(p => p.id !== excludePoolId)
  }
}

export async function fetchPoolState (poolId: string): Promise<PoolState | null> {
  const pool = await platform.getPool(poolId)
  if (pool == null) return null

  const [allJoins, locks, height] = await Promise.all([
    platform.listJoins(pool.id),
    platform.listLocks([pool.id]),
    chain.getBestBlockHeight()
  ])
  const joins = allJoins.filter(j => joinProblems(j, pool).length === 0)
  const lock = findPoolLock(pool, locks)

  const base: PoolState = {
    pool, joins, lock, members: [], feeFunding: null, lockProblems: [], registration: null, finalTx: null,
    regTx: null, masternode: null, registeredHeight: null, height, status: 'NEW', dissolutionTxid: null, stage: null,
    consentCount: 0, fundingCount: 0, operatorKey: { masternode: null, otherPools: [] }, prevouts: new Map(), broadcastProblems: []
  }
  if (lock == null) return { ...base, operatorKey: await fetchOperatorKeyUsage(pool.operatorPubKey, pool.id), prevouts: new Map() }

  const feeInputs = pool.feePayer === 'creator' ? lock.feeInputs ?? [] : []
  const resolved = lockMembers(lock, joins)
  const present = resolved.filter((j): j is Join => j != null)
  const lockProblems = [
    ...(present.length < resolved.length ? ['A selected join is missing or invalid'] : []),
    ...selectionProblems(pool, present)
  ]

  const [consents, fundings, feeFundings, inputValues, prevouts] = await Promise.all([
    platform.listConsents(lock.id),
    platform.listFundings(lock.id),
    platform.listFeeFundings(lock.id),
    fetchInputValues(present, feeInputs),
    fetchPrevouts(present, feeInputs)
  ])

  // A lock that selected no valid join has no shared ProRegTx to build; consentHash() is only defined
  // for one, so leave the registration absent and let lockProblems explain the state.
  const registration = present.length === 0
    ? null
    : txBuilder.buildRegistration(pool, present, inputValues, feeInputs, lock.feeChangeAddress)
  if (registration != null) lockProblems.push(...registration.problems)

  const members: MemberState[] = present.map((join, shareIndex) => ({
    join,
    shareIndex,
    consent: registration == null
      ? null
      : memberDocument(consents, lock.id, join.ownerId, c => txBuilder.verifyConsent(registration, shareIndex, c.signature)),
    funding: null
  }))
  // A lock with no usable members has nothing to sign: "every member" must not hold vacuously
  const allConsented = members.length > 0 && members.every(m => m.consent != null)
  // Funding signatures cover the join signatures too, so they are checked against the join-signed tx
  const joinedHex = allConsented && registration != null
    ? txBuilder.withJoinSignatures(registration, members.map(m => m.consent?.signature ?? ''))
    : ''
  // Funding signatures only mean something once every consent is in
  if (allConsented && registration != null) {
    for (const m of members) {
      m.funding = memberDocument(fundings, lock.id, m.join.ownerId, f => txBuilder.verifyScriptSigs(registration, m.shareIndex, f.scriptSigs, prevouts, joinedHex))
    }
  }
  const feeFunding = registration != null && pool.feePayer === 'creator' && allConsented
    ? memberDocument(feeFundings, lock.id, pool.ownerId, f => txBuilder.verifyFeeScriptSigs(registration, f.scriptSigs, prevouts, joinedHex))
    : null
  const allFunded = allConsented && members.every(m => m.funding != null) && (pool.feePayer !== 'creator' || feeFunding != null)

  let finalTx: PoolState['finalTx'] = null
  let regTx: ChainTx | null = null
  let masternode: MasternodeEntry | null = null
  let registeredHeight: number | null = null
  let masternodeListHeight: number | null = null
  let broadcastProblems: string[] = []
  if (allFunded && lockProblems.length === 0 && registration != null) {
    finalTx = txBuilder.combine(
      registration,
      members.map(m => m.consent?.signature ?? ''),
      members.map(m => m.funding?.scriptSigs ?? []),
      feeFunding?.scriptSigs ?? []
    )
    // Nothing is broadcast that has not been re-checked against the final bytes
    broadcastProblems = finalTxProblems(
      { hex: finalTx.hex, collateralIndex: registration.collateralIndex },
      present,
      inputValues,
      feeInputs,
      pool.fee
    )
    regTx = await chain.getTransaction(finalTx.txid)
    if (regTx?.height != null) {
      ;[masternode, registeredHeight, masternodeListHeight] = await Promise.all([
        chain.getMasternode(finalTx.txid),
        chain.getRegisteredHeight(finalTx.txid),
        chain.getMasternodeListHeight()
      ])
    }
  }

  const dissolutionTxid = pendingDissolution(pool.id)
  const statusInput = { lock, allConsented, allFunded, regTx, masternode, masternodeListHeight, height, dissolutionTxid }
  const status = derivePoolStatus(statusInput)
  // The list has dropped the entry: the chain itself now says dissolved, so the local note is done
  if (status === 'DISSOLVED') clearDissolution(pool.id)
  // Key conflicts only matter until the pool registers
  const operatorKey = status === 'SIGNING'
    ? await fetchOperatorKeyUsage(pool.operatorPubKey, pool.id, finalTx?.txid)
    : base.operatorKey
  return {
    ...base,
    members,
    feeFunding,
    lockProblems: [...new Set(lockProblems)],
    registration,
    finalTx,
    regTx,
    masternode,
    registeredHeight,
    status,
    dissolutionTxid,
    stage: status === 'SIGNING' ? signingStage(statusInput) : null,
    consentCount: members.filter(m => m.consent != null).length,
    fundingCount: members.filter(m => m.funding != null).length,
    operatorKey,
    prevouts,
    broadcastProblems
  }
}

export async function fetchInputValues (joins: Join[], extra: Outpoint[] = []): Promise<Map<string, Duffs | null>> {
  const outpoints = [...joins.flatMap(j => j.inputs), ...extra]
  const values = await Promise.all(outpoints.map(async o => await chain.getOutputValue(o)))
  return new Map(outpoints.map((o, i) => [outpointKey(o), values[i]]))
}

/** Scripts and values of the joins' funding outputs, for checking P2PKH funding signatures */
export async function fetchPrevouts (joins: Join[], extra: Outpoint[] = []): Promise<Map<string, Prevout | null>> {
  const outpoints = [...joins.flatMap(j => j.inputs), ...extra]
  const prevouts = await Promise.all(outpoints.map(async o => await chain.getPrevout(o)))
  return new Map(outpoints.map((o, i) => [outpointKey(o), prevouts[i]]))
}

export interface CreatorProfile {
  ownerId: string
  pools: PoolState[]
  stats: {
    created: number
    formed: number
    active: number
    error: number
    dissolved: number
    signing: number
    open: number
    /** Average hours from the pool first having enough joins to its lock */
    avgLockHours: number | null
    rating: number | null
    ratingCount: number
  }
  feedback: Array<Feedback & { poolName: string }>
}

export async function fetchCreatorProfile (ownerId: string): Promise<CreatorProfile> {
  const pools = await platform.listPoolsByOwner(ownerId)
  const states = (await Promise.all(pools.map(async p => await fetchPoolState(p.id)))).filter((s): s is PoolState => s != null)
  const feedbackLists = await Promise.all(states.map(async s => await platform.listFeedback(s.pool.id)))
  const feedback = states.flatMap((s, i) => eligibleFeedback(s, feedbackLists[i]).map(f => ({ ...f, poolName: s.pool.name })))

  const lockHours = states.flatMap(s => {
    if (s.lock == null) return []
    const ready = readySince(s.joins)
    return ready == null || ready > s.lock.createdAt ? [] : [(s.lock.createdAt - ready) / 3_600_000]
  })
  const count = (...statuses: PoolStatus[]): number => states.filter(s => statuses.includes(s.status)).length
  return {
    ownerId,
    pools: states,
    stats: {
      created: states.length,
      formed: count('FORMED', 'ERROR', 'DISSOLVED'),
      active: count('FORMED'),
      error: count('ERROR'),
      dissolved: count('DISSOLVED'),
      signing: count('SIGNING'),
      open: count('NEW'),
      avgLockHours: lockHours.length > 0 ? lockHours.reduce((a, b) => a + b, 0) / lockHours.length : null,
      rating: feedback.length > 0 ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : null,
      ratingCount: feedback.length
    },
    feedback
  }
}

/** When the pool's joins first added up to the collateral (the lock could have happened from then on) */
function readySince (joins: Join[]): number | null {
  let total = 0
  for (const join of [...joins].sort((a, b) => a.createdAt - b.createdAt)) {
    total += join.amount
    if (total >= COLLATERAL) return join.createdAt
  }
  return null
}

/** Feedback counts only from members of the lock of a pool that reached FORMED (DESIGN.md §11) */
export function eligibleFeedback (state: PoolState, feedback: Feedback[]): Feedback[] {
  if (!['FORMED', 'ERROR', 'DISSOLVED'].includes(state.status)) return []
  const members = new Set(state.members.map(m => m.join.ownerId))
  const seen = new Set<string>()
  return feedback.filter(f => {
    if (!members.has(f.ownerId) || seen.has(f.ownerId) || f.rating < 1 || f.rating > 5) return false
    seen.add(f.ownerId)
    return true
  })
}

export type ActionKind = 'consent' | 'funding' | 'lock' | 'broadcast'

export interface ActionItem {
  kind: ActionKind
  pool: Pool
}

export interface MyActivity {
  created: PoolState[]
  joined: Array<{ state: PoolState, join: Join, selected: boolean }>
  actions: ActionItem[]
}

export async function fetchMyActivity (identity: string): Promise<MyActivity> {
  const [ownPools, myJoins] = await Promise.all([
    platform.listPoolsByOwner(identity),
    platform.listJoinsByOwner(identity)
  ])
  const poolIds = [...new Set([...ownPools.map(p => p.id), ...myJoins.map(j => j.poolId)])]
  const states = new Map(
    (await Promise.all(poolIds.map(async id => await fetchPoolState(id))))
      .filter((s): s is PoolState => s != null)
      .map(s => [s.pool.id, s])
  )

  const created = ownPools.map(p => states.get(p.id)).filter((s): s is PoolState => s != null)
  const joined = myJoins.flatMap(join => {
    const state = states.get(join.poolId)
    if (state == null) return []
    return [{ state, join, selected: state.members.some(m => m.join.id === join.id) }]
  })

  const actions: ActionItem[] = []
  for (const { state } of joined) {
    const me = state.members.find(m => m.join.ownerId === identity)
    if (me == null || state.status !== 'SIGNING') continue
    if (state.stage === 'consent' && me.consent == null) actions.push({ kind: 'consent', pool: state.pool })
    if (state.stage === 'funding' && me.funding == null) actions.push({ kind: 'funding', pool: state.pool })
  }
  for (const state of created) {
    const total = state.joins.reduce((s, j) => s + j.amount, 0)
    if (state.status === 'NEW' && state.joins.length >= MIN_SHARES && total >= COLLATERAL) actions.push({ kind: 'lock', pool: state.pool })
    if (state.stage === 'broadcast' && state.lockProblems.length === 0) actions.push({ kind: 'broadcast', pool: state.pool })
  }
  return { created, joined, actions }
}
