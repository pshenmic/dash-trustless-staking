import type { MemberState, PoolState } from '../../data/queries'
import type { Join } from '../../lib/types'

export interface PoolRole {
  me: string | null
  isCreator: boolean
  /** The user's join, whether or not they were selected */
  myJoin: Join | null
  /** The user's place in the lock, if selected */
  myMember: MemberState | null
}

export function poolRole (state: PoolState, me: string | null): PoolRole {
  return {
    me,
    isCreator: me != null && me === state.pool.ownerId,
    myJoin: me == null ? null : state.joins.find(j => j.ownerId === me) ?? null,
    myMember: me == null ? null : state.members.find(m => m.join.ownerId === me) ?? null
  }
}

/**
 * True while the signed-in user has a signing task in front of them. Those panels are wide
 * (transaction hex, commands, key fields) and belong on their own full-width surface, not in
 * the narrow pool-details sidebar.
 */
export function hasSigningTask (state: PoolState, role: PoolRole): boolean {
  if (state.status !== 'SIGNING' || role.me == null || state.lockProblems.length > 0) return false
  if (state.stage === 'broadcast') return true

  if (role.myMember != null) {
    if (state.stage === 'consent' && role.myMember.consent == null) return true
    if (state.stage === 'funding' && role.myMember.funding == null) return true
  }

  return state.stage === 'funding' &&
    role.isCreator &&
    state.pool.feePayer === 'creator' &&
    state.feeFunding == null
}
