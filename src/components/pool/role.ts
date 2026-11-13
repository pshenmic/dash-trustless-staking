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

