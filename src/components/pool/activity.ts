import type { PoolState } from '../../data/queries'
import { formatDash } from '../../lib/format'
import type { Join, Pool, PoolMeta, Vote } from '../../lib/types'
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
 * Metadata changes are display-only, but they belong in the history: a rename is a public act.
 * Each document is compared with the value it replaces — the pool document's own fields for the first
 * one, the previous document after that — so a save that repeats a value adds no line.
 */
export function poolMetaEvents (metas: PoolMeta[], pool: Pick<Pool, 'ownerId' | 'name' | 'description'>): PoolEvent[] {
  const documents = metas
    .filter(meta => meta.ownerId === pool.ownerId)
    .sort((a, b) => a.createdAt - b.createdAt)
  const events: PoolEvent[] = []
  let name = pool.name ?? ''
  let description = pool.description ?? ''
  for (const meta of documents) {
    const at = meta.createdAt
    const who = meta.ownerId
    // A document without a field falls back to the pool document, so a partial revision can remove one
    const nextName = meta.name ?? pool.name ?? ''
    if (nextName !== name) {
      events.push({ at, who, text: nextName === '' ? 'removed the pool title' : `renamed the pool to “${nextName}”`, tone: 'brand' })
      name = nextName
    }
    const nextDescription = meta.description ?? pool.description ?? ''
    if (nextDescription !== description) {
      events.push({ at, who, text: description === '' ? 'added a pool description' : nextDescription === '' ? 'removed the pool description' : 'updated the pool description', tone: 'brand' })
      description = nextDescription
    }
  }
  return events
}

/**
 * The pool's lifecycle events, in the order they happened. Chain events have block heights rather than
 * timestamps, so they carry `at: null` and read after the documents.
 */
/** First document reads "took a … share", later ones from the same identity read as an update */
function joinEvents (joins: Join[]): PoolEvent[] {
  const seen = new Set<string>()
  return joins.map(join => {
    const first = !seen.has(join.ownerId)
    seen.add(join.ownerId)
    return {
      at: join.createdAt,
      who: join.ownerId,
      text: first ? `took a ${formatDash(join.amount)} share` : `updated their share to ${formatDash(join.amount)}`
    }
  })
}

export function poolEvents (state: PoolState, metas: PoolMeta[] = []): PoolEvent[] {
  const documents: PoolEvent[] = [
    { at: state.pool.createdAt, who: state.pool.ownerId, text: 'created the pool', tone: 'brand' },
    // Every join document is an event: a top-up replaces the member's earlier join but must not erase it
    ...joinEvents(state.allJoins),
    ...(state.lock == null ? [] : [{ at: state.lock.createdAt, who: state.lock.ownerId, text: `locked the pool with ${state.members.length} members`, tone: 'brand' as const }]),
    ...state.members.flatMap(m => [
      ...(m.consent == null ? [] : [{ at: m.consent.createdAt, who: m.join.ownerId, text: 'signed their consent' }]),
      ...(m.funding == null ? [] : [{ at: m.funding.createdAt, who: m.join.ownerId, text: 'signed their coins' }])
    ]),
    // The history starts from the pool document, not the enriched pool: its fields are already the
    // newest metadata, which would make every revision look like a no-op
    ...poolMetaEvents(metas, { ownerId: state.pool.ownerId, name: state.pool.documentName, description: state.pool.documentDescription })
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