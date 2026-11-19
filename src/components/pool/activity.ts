import type { PoolState } from '../../data/queries'
import { formatDash } from '../../lib/format'
import type { Join, Vote } from '../../lib/types'
import { outcomeLabel } from '../../lib/voting'

export interface PoolEvent {
  /** Milliseconds since the epoch, or null for chain state that has no single moment */
  at: number | null
  who?: string
  text: string
  tone?: 'brand' | 'mint' | 'red'
}

/**
 * Member vote choices as feed events. Members only (anyone can publish a vote naming any pool), and
 * every recorded choice gets a line — including superseded ones — so the feed is a chronological log.
 */
export function voteEvents (votes: Vote[], members: Join[]): PoolEvent[] {
  const memberIds = new Set(members.map(m => m.ownerId))
  return votes
    .filter(v => memberIds.has(v.ownerId))
    .map(v => ({ at: v.createdAt, who: v.ownerId, text: `recorded ${outcomeLabel(v.outcome)} on proposal ${v.proposalHash.slice(0, 8)}…`, tone: 'mint' as const }))
}

/**
 * The pool's lifecycle events, in the order they happened. Chain events have block heights rather than
 * timestamps, so they carry `at: null` and read after the documents.
 */
export function poolEvents (state: PoolState): PoolEvent[] {
  const documents: PoolEvent[] = [
    { at: state.pool.createdAt, who: state.pool.ownerId, text: 'created the pool', tone: 'brand' },
    ...state.joins.map(j => ({ at: j.createdAt, who: j.ownerId, text: `joined with ${formatDash(j.amount)}` })),
    ...(state.lock == null ? [] : [{ at: state.lock.createdAt, who: state.lock.ownerId, text: `locked the pool with ${state.members.length} members`, tone: 'brand' as const }]),
    ...state.members.flatMap(m => [
      ...(m.consent == null ? [] : [{ at: m.consent.createdAt, who: m.join.ownerId, text: 'signed their consent' }]),
      ...(m.funding == null ? [] : [{ at: m.funding.createdAt, who: m.join.ownerId, text: 'signed their coins' }])
    ])
  ]

  const chain: PoolEvent[] = []
  if (state.regTx != null) {
    chain.push(state.regTx.height == null
      ? { at: null, text: 'Registration broadcast, waiting for a block' }
      : { at: null, text: `Registered on chain at block ${state.regTx.height.toLocaleString('en-US')}`, tone: 'mint' })
  }
  if (state.status === 'REGISTERED') chain.push({ at: null, text: 'Registered; waiting for the operator to set the service address', tone: 'mint' })
  if (state.status === 'ERROR') chain.push({ at: null, text: 'Masternode is not valid (PoSe-banned or revoked)', tone: 'red' })
  if (state.status === 'DISSOLVED') chain.push({ at: null, text: 'Masternode dissolved', tone: 'red' })

  return [...documents, ...chain]
}