import { REGISTRATION_GRACE_BLOCKS } from './consensus'
import type { ChainTx, Consent, Funding, Join, Lock, MasternodeEntry, Pool, PoolListStatus, PoolStatus } from './types'

/*
 * Pool status is never stored; every client derives it (DESIGN.md §9).
 *   NEW         no lock by the pool owner
 *   SIGNING     locked, but not every consent/funding is in, or the tx is not in a block yet
 *   REGISTERED  mined and in the list, inactive because no service address is set yet, still inside
 *               the grace period after registration
 *   FORMED      the proTxHash is in the masternode list with isValid = true
 *   ERROR       in the list with isValid = false (PoSe-banned or revoked)
 *   DISSOLVING  a ProDisTx was broadcast from this browser and the chainlocked list has not
 *               dropped the entry yet
 *   DISSOLVED   the registration was mined but the masternode is gone from the list
 */

/** The pool's lock: the pool owner's lock for this pool. The unique index allows at most one. */
export function findPoolLock (pool: Pool, locks: Lock[]): Lock | null {
  const own = locks
    .filter(l => l.poolId === pool.id && l.ownerId === pool.ownerId)
    .sort((a, b) => a.createdAt - b.createdAt)
  return own[0] ?? null
}

export function listStatus (lock: Lock | null): PoolListStatus {
  return lock == null ? 'NEW' : 'LOCKED'
}

/** Joins of the lock in share order. Missing joins are returned as null. */
export function lockMembers (lock: Lock, joins: Join[]): Array<Join | null> {
  const byId = new Map(joins.map(j => [j.id, j]))
  return lock.joinIds.map(id => {
    const join = byId.get(id)
    return join != null && join.poolId === lock.poolId ? join : null
  })
}

/**
 * The document a member published for a lock, if any passes `isValid`. A member may publish
 * several (documents are immutable, so a wrong one can't be fixed); any valid one counts.
 */
export function memberDocument<T extends Consent | Funding> (
  docs: T[], lockId: string, memberId: string, isValid: (doc: T) => boolean
): T | null {
  return docs
    .filter(d => d.lockId === lockId && d.ownerId === memberId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .find(isValid) ?? null
}

export type SigningStage = 'consent' | 'funding' | 'broadcast' | 'confirming'

export interface StatusInput {
  lock: Lock | null
  allConsented: boolean
  allFunded: boolean
  regTx: ChainTx | null
  masternode: MasternodeEntry | null
  masternodeListHeight: number | null
  /** Current chain height, for the post-registration grace period */
  height: number
  /** ProDisTx this browser broadcast for the pool; see pendingDissolution.ts */
  dissolutionTxid: string | null
}

/** A masternode registered without an address reports `[::]:0` */
function hasNoService (service: string): boolean {
  return service === '' || service === '[::]:0' || service === '0.0.0.0:0'
}

export function derivePoolStatus ({ lock, allConsented, allFunded, regTx, masternode, masternodeListHeight, height, dissolutionTxid }: StatusInput): PoolStatus {
  if (lock == null) return 'NEW'
  if (!allConsented || !allFunded) return 'SIGNING'
  if (regTx == null || regTx.height == null) return 'SIGNING'

  // A dissolution we broadcast outranks the list's pre-dissolution view of the masternode: the
  // chainlocked list trails the tip, so without this a dissolved pool reads as ERROR for a few
  // minutes and invites a second dissolve.
  if (dissolutionTxid != null) {
    const listCaughtUp = masternodeListHeight != null && masternodeListHeight >= regTx.height

    return masternode == null && listCaughtUp ? 'DISSOLVED' : 'DISSOLVING'
  }

  // An entry for this proTxHash proves the list already covers the registration, whatever its
  // reported height — the height comes from the diff's cbTx and can be missing on a live stream.
  if (masternode != null) {
    if (masternode.isValid) return 'FORMED'
    // An inactive node that never had an address is not broken yet: the operator has an hour to set
    // it with a ProUpServTx before PoSe treats it as a failure. Reporting ERROR during that window
    // reads as a failed registration to everyone who just paid into the pool.
    if (hasNoService(masternode.service) && height - regTx.height < REGISTRATION_GRACE_BLOCKS) return 'REGISTERED'
    return 'ERROR'
  }

  // The masternode list is a chainlocked snapshot that can lag the tip. Until it
  // catches up to the registration height, the absence of the entry does not mean
  // the pool was dissolved — it may just not have arrived yet.
  if (masternodeListHeight == null || masternodeListHeight < regTx.height) return 'SIGNING'

  return 'DISSOLVED'
}

export function signingStage ({ allConsented, allFunded, regTx }: StatusInput): SigningStage {
  if (!allConsented) return 'consent'
  if (!allFunded) return 'funding'
  if (regTx == null) return 'broadcast'
  return 'confirming'
}
