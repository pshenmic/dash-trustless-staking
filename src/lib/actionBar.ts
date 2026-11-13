import type { MemberState, PoolState } from '../data/queries'
import { COLLATERAL } from './consensus'
import { formatDash } from './format'
import type { Join } from './types'

export type ActionTone = 'blue' | 'peach' | 'mint' | 'red' | 'grey' | 'neutral'
export type ActionKind = 'login' | 'join' | 'lock' | 'consent' | 'funding' | 'fee' | 'broadcast'

export interface ActionBarAction {
  kind: ActionKind
  label: string
  disabled: boolean
}

export interface ActionBarRing {
  /** Shown in the middle of the ring: "50%", "3/5" */
  label: string
  value: number
  max: number
}

export interface ActionBarModel {
  tone: ActionTone
  ring: ActionBarRing | null
  title: string
  subtitle: string
  action: ActionBarAction | null
  /** Waiting on other people or the chain: show a spinner instead of a button */
  busy: boolean
}

/** The subset of PoolRole the bar reads; PoolRole is assignable to this */
export interface ActionBarRole {
  me: string | null
  isCreator: boolean
  myJoin: Join | null
  myMember: MemberState | null
}

const action = (kind: ActionKind, label: string, disabled = false): ActionBarAction => ({ kind, label, disabled })

function joinedTotal (state: PoolState): number {
  return state.joins.reduce((sum, join) => sum + join.amount, 0)
}

function percentRing (total: number): ActionBarRing {
  const value = Math.min(100, Math.round((total / COLLATERAL) * 100))
  return { label: `${value}%`, value, max: 100 }
}

const fullRing: ActionBarRing = { label: '100%', value: 100, max: 100 }

/** One step per consent and per funding, plus the creator's fee input when the creator pays */
export function signingProgress (state: PoolState): ActionBarRing {
  const creatorPays = state.pool.feePayer === 'creator'
  const max = state.members.length * 2 + (creatorPays ? 1 : 0)
  const value = state.consentCount + state.fundingCount + (creatorPays && state.feeFunding != null ? 1 : 0)
  return { label: `${value}/${max}`, value, max }
}

export function actionBarState (state: PoolState, role: ActionBarRole): ActionBarModel {
  // A lock that can never form outranks everything: no action can fix it, only a new pool
  if (state.lockProblems.length > 0) {
    return {
      tone: 'red',
      ring: null,
      title: 'This lock cannot form',
      subtitle: `${state.lockProblems[0]}. The creator has to start a new pool.`,
      action: null,
      busy: false
    }
  }

  if (state.status === 'NEW') {
    const ring = percentRing(joinedTotal(state))

    if (role.me == null) {
      return {
        tone: 'blue',
        ring,
        title: 'Join this pool',
        subtitle: 'Stake at least 100 DASH to join',
        action: action('login', 'Log in'),
        busy: false
      }
    }

    // A creator who joined their own pool still has to lock it, so the creator branch comes first
    if (role.isCreator) {
      const total = joinedTotal(state)
      if (total >= COLLATERAL) {
        return {
          tone: 'blue',
          ring,
          title: 'Ready to lock',
          subtitle: 'Select members totalling 1000 DASH',
          action: action('lock', 'Select members'),
          busy: false
        }
      }
      return {
        tone: 'peach',
        ring,
        title: 'Waiting for members',
        subtitle: `${formatDash(COLLATERAL - total)} more before you can lock`,
        action: role.myJoin == null ? action('join', 'Join your own pool') : null,
        busy: role.myJoin != null
      }
    }

    if (role.myJoin != null) {
      return {
        tone: 'peach',
        ring,
        title: `You joined ${formatDash(role.myJoin.amount)}`,
        subtitle: 'Waiting for the creator to fill and lock',
        action: null,
        busy: true
      }
    }

    return {
      tone: 'blue',
      ring,
      title: 'Join this pool',
      subtitle: 'Stake at least 100 DASH to join',
      action: action('join', 'Join'),
      busy: false
    }
  }

  if (state.status === 'SIGNING') {
    if (state.stage === 'confirming') {
      return {
        tone: 'mint',
        ring: fullRing,
        title: 'Waiting for a block',
        subtitle: 'The registration is in the mempool',
        action: null,
        busy: true
      }
    }

    if (state.stage === 'broadcast') {
      const blocked = state.broadcastProblems.length > 0
      return {
        tone: blocked ? 'red' : 'mint',
        ring: fullRing,
        title: blocked ? 'Not ready to broadcast' : 'All signatures collected',
        subtitle: blocked ? state.broadcastProblems[0] : 'Broadcast the registration',
        action: action('broadcast', 'Broadcast', blocked),
        busy: false
      }
    }

    const ring = signingProgress(state)

    if (role.me == null) {
      return {
        tone: 'neutral',
        ring,
        title: 'Signing in progress',
        subtitle: 'Log in if you are a member of this pool',
        action: action('login', 'Log in'),
        busy: false
      }
    }

    // The creator's fee input is its own step: it stays due even when their member part is done
    const feeDue = role.isCreator && state.pool.feePayer === 'creator' && state.feeFunding == null && state.stage === 'funding'

    if (role.myMember != null) {
      if (state.stage === 'consent' && role.myMember.consent == null) {
        return {
          tone: 'peach',
          ring,
          title: 'Sign the consent',
          subtitle: 'Approve the terms in your wallet',
          action: action('consent', 'Sign'),
          busy: false
        }
      }
      if (state.stage === 'funding' && role.myMember.funding == null) {
        return {
          tone: 'peach',
          ring,
          title: 'Sign your coins',
          subtitle: 'Sign only your own inputs',
          action: action('funding', 'Sign'),
          busy: false
        }
      }
      if (feeDue) {
        return {
          tone: 'peach',
          ring,
          title: 'Sign the registration fee',
          subtitle: 'Your fee input funds the transaction',
          action: action('fee', 'Sign'),
          busy: false
        }
      }
      return {
        tone: 'mint',
        ring,
        title: 'Your part is done',
        subtitle: 'Waiting for the other members',
        action: null,
        busy: true
      }
    }

    if (feeDue) {
      return {
        tone: 'peach',
        ring,
        title: 'Sign the registration fee',
        subtitle: 'Your fee input funds the transaction',
        action: action('fee', 'Sign'),
        busy: false
      }
    }

    if (role.myJoin != null) {
      return {
        tone: 'grey',
        ring,
        title: 'You were not selected',
        subtitle: 'Your coins were never used',
        action: null,
        busy: false
      }
    }

    return {
      tone: 'neutral',
      ring,
      title: 'Signing in progress',
      subtitle: 'This pool no longer accepts joins',
      action: null,
      busy: false
    }
  }

  if (state.status === 'REGISTERED') {
    return {
      tone: 'blue',
      ring: fullRing,
      title: 'Waiting for the operator',
      subtitle: 'Sets the address with ProUpServTx',
      action: null,
      busy: false
    }
  }

  if (state.status === 'FORMED') {
    return {
      tone: 'mint',
      ring: fullRing,
      title: 'Masternode is running',
      subtitle: role.myMember != null
        ? 'Rewards go straight to your reward address'
        : "Rewards go straight to each member's reward address",
      action: null,
      busy: false
    }
  }

  if (state.status === 'ERROR') {
    return {
      tone: 'red',
      ring: fullRing,
      title: 'Masternode is not valid',
      subtitle: 'PoSe-banned or revoked until the operator acts',
      action: null,
      busy: false
    }
  }

  if (state.status === 'DISSOLVING') {
    return {
      tone: 'grey',
      ring: fullRing,
      title: 'Dissolving',
      subtitle: 'The refunds arrive when it is mined',
      action: null,
      busy: true
    }
  }

  if (state.status === 'DISSOLVED') {
    return {
      tone: 'grey',
      ring: fullRing,
      title: 'Dissolved',
      subtitle: 'Principal refunded to every refund address',
      action: null,
      busy: false
    }
  }

  // Defensive: a combination the mapper does not know still gets a truthful, actionless bar
  return {
    tone: 'neutral',
    ring: null,
    title: 'This pool is waiting',
    subtitle: 'Nothing to do right now',
    action: null,
    busy: false
  }
}