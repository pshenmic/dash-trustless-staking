import { COLLATERAL, MIN_SHARES } from '../lib/consensus'
import { joinProblems, selectionProblems } from '../lib/rules'
import { finalTxProblems } from '../lib/preflight'
import { clearDissolution, pendingDissolution } from '../lib/pendingDissolution'
import {
  derivePoolStatus, findPoolLock, listStatus, lockMembers, memberDocument, signingStage, type SigningStage
} from '../lib/status'
import type {
  ChainTx, Consent, Duffs, Feedback, Funding, Join, Lock, MasternodeEntry, Network, Outpoint, Pool, PoolListStatus, PoolStatus, Prevout, Vote, VoteOutcome
} from '../lib/types'
import { latestJoins } from '../lib/joins'
import { entriesProblems } from '../lib/lockEntries'
import { homeStats, type HomeStats } from '../lib/homeStats'
import { withDisplayMeta, type DisplayPool } from '../lib/poolName'
import { groupVotesByPool, latestVotesPerProposal, poolVoteSummary } from '../lib/voting'
import {
  aggregateProposal, governanceOverview, poolLeaderboard, proposalParticipation, voteTrend,
  type GovernanceStats, type ProposalStats
} from '../lib/governanceStats'
import { HOSTING_VOTING_ADDRESS } from '../hosting'
import { backend } from './index'
import { outpointKey, type PlatformSource, type RegistrationTx } from './types'

const { chain, tx: txBuilder } = backend

export interface PoolSummary {
  pool: DisplayPool
  lock: Lock | null
  listStatus: PoolListStatus
  joinCount: number
  joinedTotal: Duffs
}

/** Everything the pools list needs, from Platform only */
export async function fetchPoolSummaries (platform: PlatformSource = backend.platform): Promise<PoolSummary[]> {
  const pools = await platform.listPools()
  const poolIds = pools.map(p => p.id)
  const [locks, allJoins, metas] = await Promise.all([
    platform.listLocks(poolIds),
    platform.listJoinsByPools(poolIds),
    platform.listPoolMetasByPools(poolIds)
  ])
  return pools.map(document => {
    const pool = withDisplayMeta(document, metas.filter(m => m.poolId === document.id))
    const lock = findPoolLock(pool, locks)
    // A top-up is a newer join by the same identity: count only the current document per member
    const joins = latestJoins(allJoins
      .filter(j => j.poolId === pool.id)
      .filter(j => joinProblems(j, pool).length === 0))
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

/**
 * Landing-page totals. Three document queries (pools, locks, joins) — the same inputs the pools grid
 * needs anyway — folded by the pure `homeStats`. Shares are counted as stored: the contract already
 * bounds amount and inputs, so a current document is a real commitment.
 */
export async function fetchHomeStats (platform: PlatformSource = backend.platform): Promise<HomeStats> {
  const pools = await platform.listPools()
  const poolIds = pools.map(p => p.id)
  const [locks, joins] = await Promise.all([
    platform.listLocks(poolIds),
    platform.listJoinsByPools(poolIds)
  ])
  return homeStats(pools, locks, joins)
}

export interface StatsSource {
  pools: Pool[]
  locks: Lock[]
  joins: Join[]
}

/** The stats page's raw documents: the same three queries the grid and the home page use */
export async function fetchStatsSource (platform: PlatformSource = backend.platform): Promise<StatsSource> {
  const pools = await platform.listPools()
  const poolIds = pools.map(p => p.id)
  const [locks, joins] = await Promise.all([
    platform.listLocks(poolIds),
    platform.listJoinsByPools(poolIds)
  ])
  return { pools, locks, joins }
}

export interface PoolSentiment {
  pool: DisplayPool
  choices: Vote[]
  tally: VoteOutcome | null
  votedStake: number
  totalStake: number
}

export interface ProposalSentiment {
  proposalHash: string
  pools: PoolSentiment[]
  /** How many pools lean each way (null tallies excluded) */
  overall: { yes: number, no: number, abstain: number }
}

/** Cross-pool sentiment on a proposal, from Platform documents only (lock + joins + votes, no chain) */
export async function fetchProposalSentiment (proposalHash: string, platform: PlatformSource = backend.platform): Promise<ProposalSentiment> {
  const votes = await platform.listVotesByProposal(proposalHash)
  const byPool = groupVotesByPool(votes)
  const poolIds = [...byPool.keys()]
  if (poolIds.length === 0) return { proposalHash, pools: [], overall: { yes: 0, no: 0, abstain: 0 } }
  const [pools, locks, allJoins, metas] = await Promise.all([
    platform.listPools(),
    platform.listLocks(poolIds),
    platform.listJoinsByPools(poolIds),
    platform.listPoolMetasByPools(poolIds)
  ])
  const poolMap = new Map(pools.map(p => [p.id, withDisplayMeta(p, metas.filter(m => m.poolId === p.id))]))
  const sentiments: PoolSentiment[] = []
  for (const poolId of poolIds) {
    const pool = poolMap.get(poolId)
    if (pool == null) continue // votes naming an unknown pool
    const lock = findPoolLock(pool, locks)
    if (lock == null) continue // no locked member set to weight against
    const joins = allJoins.filter(j => j.poolId === poolId && joinProblems(j, pool).length === 0)
    const members = lockMembers(lock, joins).filter((j): j is Join => j != null)
    const summary = poolVoteSummary(members, byPool.get(poolId)!)
    if (summary.choices.length === 0) continue // no member chose; a stranger's doc must not surface a row
    sentiments.push({ pool, ...summary })
  }
  sentiments.sort((a, b) => b.totalStake - a.totalStake)
  const overall = { yes: 0, no: 0, abstain: 0 }
  for (const s of sentiments) {
    if (s.tally === 1) overall.yes++
    else if (s.tally === 2) overall.no++
    else if (s.tally === 3) overall.abstain++
  }
  return { proposalHash, pools: sentiments, overall }
}

/** Network-wide governance dashboard stats over hosted pools that can actually vote (Platform-only, plus chain state) */
export async function fetchGovernanceStats (network: Network = 'testnet', platform: PlatformSource = backend.platform): Promise<GovernanceStats> {
  const [votes, allPools, height] = await Promise.all([
    platform.listAllVotes(),
    platform.listPools(),
    chain.getBestBlockHeight()
  ])
  const hostedDocuments = allPools.filter(p => p.votingAddress === HOSTING_VOTING_ADDRESS)
  const hostedMetas = await platform.listPoolMetasByPools(hostedDocuments.map(p => p.id))
  const hosted = hostedDocuments.map(p => withDisplayMeta(p, hostedMetas.filter(m => m.poolId === p.id)))
  // A dissolved (or PoSe-banned) node can no longer produce a vote: `voteraw` refuses any outpoint
  // missing from the chain-tip list of valid masternodes, and Core gives a removed node's standing
  // votes no weight. The operator key identifies the entry without rebuilding each registration; the
  // chainlocked list can lag a fresh registration, but such a pool has no choices yet.
  const votable = await Promise.all(hosted.map(async p => (await chain.getMasternodeByOperatorKey(p.operatorPubKey))?.isValid === true))
  const pools = hosted.filter((_, i) => votable[i])
  const poolIds = pools.map(p => p.id)
  const [locks, allJoins] = await Promise.all([
    platform.listLocks(poolIds),
    platform.listJoinsByPools(poolIds)
  ])
  const membersByPool = new Map<string, Join[]>()
  for (const pool of pools) {
    const lock = findPoolLock(pool, locks)
    if (lock == null) continue
    const joins = allJoins.filter(j => j.poolId === pool.id && joinProblems(j, pool).length === 0)
    membersByPool.set(pool.id, lockMembers(lock, joins).filter((j): j is Join => j != null))
  }
  const totalStake = pools.reduce((s, p) => s + (membersByPool.get(p.id) ?? []).reduce((a, j) => a + j.amount, 0), 0)
  const totalMembers = pools.reduce((s, p) => s + (membersByPool.get(p.id)?.length ?? 0), 0)

  const byProposal = new Map<string, Vote[]>()
  for (const v of votes) {
    const list = byProposal.get(v.proposalHash) ?? []
    list.push(v)
    byProposal.set(v.proposalHash, list)
  }
  const proposals: ProposalStats[] = []
  for (const [proposalHash, proposalVotes] of byProposal) {
    const byPool = groupVotesByPool(proposalVotes)
    const sentiments: PoolSentiment[] = []
    for (const pool of pools) {
      const members = membersByPool.get(pool.id)
      const poolVotes = byPool.get(pool.id)
      if (members == null || poolVotes == null) continue
      const summary = poolVoteSummary(members, poolVotes)
      if (summary.choices.length === 0) continue
      sentiments.push({ pool, ...summary })
    }
    if (sentiments.length === 0) continue // stranger-only proposal
    const { stake, count, margin, leading } = aggregateProposal(sentiments)
    proposals.push({
      proposalHash, pools: sentiments, stake, count, margin, leading,
      participation: proposalParticipation(sentiments, pools.length, totalStake, totalMembers),
      lastActivity: Math.max(...proposalVotes.map(v => v.createdAt))
    })
  }
  proposals.sort((a, b) => a.margin - b.margin)
  const memberVotes = votes.filter(v => (membersByPool.get(v.poolId) ?? []).some(m => m.ownerId === v.ownerId))
  return {
    overview: governanceOverview(pools, membersByPool, votes, height, network),
    proposals,
    leaderboard: poolLeaderboard(votes, pools, membersByPool),
    trend: voteTrend(memberVotes, 86_400_000, 30)
  }
}

export interface MemberState {
  join: Join
  shareIndex: number
  consent: Consent | null
  funding: Funding | null
}

export interface PoolState {
  pool: DisplayPool
  /** The current join per identity (newest), oldest first — what totals, roles and the lock use */
  joins: Join[]
  /** Every valid join document, oldest first. The activity feed reads this so a superseded join stays in the history */
  allJoins: Join[]
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
export async function fetchOperatorKeyUsage (operatorPubKey: string, excludePoolId?: string, ownProTxHash?: string, platform: PlatformSource = backend.platform): Promise<OperatorKeyUsage> {
  const [masternode, pools] = await Promise.all([
    chain.getMasternodeByOperatorKey(operatorPubKey),
    platform.listPoolsByOperatorKey(operatorPubKey)
  ])
  return {
    masternode: masternode != null && masternode.proTxHash !== ownProTxHash ? masternode : null,
    otherPools: pools.filter(p => p.id !== excludePoolId)
  }
}

export async function fetchPoolState (poolId: string, preloaded?: Pool | null, platform: PlatformSource = backend.platform): Promise<PoolState | null> {
  if (preloaded === null) return null
  // joins, locks and height are keyed by poolId, so they don't need to wait for the pool document
  const [document, allJoins, locks, height, metas] = await Promise.all([
    preloaded ?? platform.getPool(poolId),
    platform.listJoins(poolId),
    platform.listLocks([poolId]),
    chain.getBestBlockHeight(),
    platform.listPoolMetas(poolId)
  ])
  if (document == null) return null
  const pool = withDisplayMeta(document, metas)
  const validJoins = allJoins.filter(j => joinProblems(j, pool).length === 0)
  // The pool page, the member's own row and the vote weights all read the current join per identity.
  // Lock resolution below still uses `validJoins`: a lock names document ids, and it must resolve even
  // when the creator selected an older version of someone's join.
  const joins = latestJoins(validJoins)
  const lock = findPoolLock(pool, locks)

  const base: PoolState = {
    pool, joins, allJoins: validJoins, lock, members: [], feeFunding: null, lockProblems: [], registration: null, finalTx: null,
    regTx: null, masternode: null, registeredHeight: null, height, status: 'NEW', dissolutionTxid: null, stage: null,
    consentCount: 0, fundingCount: 0, operatorKey: { masternode: null, otherPools: [] }, prevouts: new Map(), broadcastProblems: []
  }
  if (lock == null) return { ...base, operatorKey: await fetchOperatorKeyUsage(pool.operatorPubKey, pool.id, undefined, platform), prevouts: new Map() }

  const feeInputs = pool.feePayer === 'creator' ? lock.feeInputs ?? [] : []
  const resolved = lockMembers(lock, validJoins)
  const present = resolved.filter((j): j is Join => j != null)
  const lockProblems = [
    ...(present.length < resolved.length ? ['A selected join is missing or invalid'] : []),
    ...selectionProblems(pool, present),
    ...entriesProblems(lock, validJoins)
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
  const blocked = lockProblems.length > 0 || broadcastProblems.length > 0
  const statusInput = { lock, allConsented, allFunded, regTx, masternode, masternodeListHeight, height, dissolutionTxid, blocked }
  const status = derivePoolStatus(statusInput)
  // The list has dropped the entry: the chain itself now says dissolved, so the local note is done
  if (status === 'DISSOLVED') clearDissolution(pool.id)
  // Key conflicts only matter until the pool registers
  const operatorKey = status === 'SIGNING'
    ? await fetchOperatorKeyUsage(pool.operatorPubKey, pool.id, finalTx?.txid, platform)
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
    // Kept for ERROR as well: the action panel explains a blocked registration at the broadcast stage,
    // and a null stage would hide that explanation behind the error badge
    stage: lock == null ? null : signingStage(statusInput),
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

export async function fetchCreatorProfile (ownerId: string, platform: PlatformSource = backend.platform): Promise<CreatorProfile> {
  const pools = await platform.listPoolsByOwner(ownerId)
  const states = (await Promise.all(pools.map(async p => await fetchPoolState(p.id, undefined, platform)))).filter((s): s is PoolState => s != null)
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
  /** Current choice per proposal this identity voted on (index vote.$ownerId) */
  votes: Array<{ vote: Vote, pool: Pool | null }>
  /** Reviews this identity wrote (index feedback.$ownerId) */
  reviews: Array<{ feedback: Feedback, pool: Pool | null }>
}

export async function fetchMyActivity (identity: string, platform: PlatformSource = backend.platform): Promise<MyActivity> {
  const [ownPools, myJoins, myVotes, myFeedback] = await Promise.all([
    platform.listPoolsByOwner(identity),
    platform.listJoinsByOwner(identity),
    platform.listVotesByOwner(identity),
    platform.listFeedbackByOwner(identity)
  ])
  const poolIds = [...new Set([...ownPools.map(p => p.id), ...myJoins.map(j => j.poolId)])]
  const states = new Map(
    (await Promise.all(poolIds.map(async id => await fetchPoolState(id, undefined, platform))))
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
  return {
    created,
    joined,
    actions,
    // One row per proposal, newest choice wins: a changed vote must not show twice
    votes: latestVotesPerProposal(myVotes).map(vote => ({ vote, pool: states.get(vote.poolId)?.pool ?? null })),
    reviews: myFeedback.map(feedback => ({ feedback, pool: states.get(feedback.poolId)?.pool ?? null }))
  }
}
