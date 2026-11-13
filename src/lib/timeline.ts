import type { PoolState } from '../data/queries'
import { formatDash } from './format'
import type { Message } from './types'

export type TimelineItem =
  | { kind: 'event', id: string, at: number, ownerId?: string, text: string, tone?: 'brand' | 'mint' | 'red' }
  | { kind: 'message', id: string, at: number, ownerId: string, text: string }

/**
 * The chat tab's stream: chat messages plus the pool events that carry a timestamp. Chain facts
 * (mined, dissolved) only have block heights and stay in the Activity tab — nothing is given a time
 * it does not have.
 */
export function poolTimeline (state: PoolState, messages: Message[]): TimelineItem[] {
  const items: TimelineItem[] = [
    { kind: 'event', id: 'created', at: state.pool.createdAt, ownerId: state.pool.ownerId, text: 'created the pool', tone: 'brand' }
  ]

  for (const join of state.joins) {
    items.push({
      kind: 'event',
      id: `join-${join.id}`,
      at: join.createdAt,
      ownerId: join.ownerId,
      text: `joined with ${formatDash(join.amount)}`
    })
  }

  if (state.lock != null) {
    items.push({
      kind: 'event',
      id: 'lock',
      at: state.lock.createdAt,
      ownerId: state.lock.ownerId,
      text: `locked the pool with ${state.members.length} members`,
      tone: 'brand'
    })
  }

  for (const member of state.members) {
    if (member.consent != null) {
      items.push({ kind: 'event', id: `consent-${member.join.id}`, at: member.consent.createdAt, ownerId: member.join.ownerId, text: 'signed the consent' })
    }
    if (member.funding != null) {
      items.push({ kind: 'event', id: `funding-${member.join.id}`, at: member.funding.createdAt, ownerId: member.join.ownerId, text: 'signed their coins' })
    }
  }

  const hasMembers = state.members.length > 0
  const allConsented = hasMembers && state.members.every(member => member.consent != null)
  const allFunded = allConsented &&
    state.members.every(member => member.funding != null) &&
    (state.pool.feePayer !== 'creator' || state.feeFunding != null)

  if (allFunded) {
    const times = state.members.flatMap(member => [member.consent?.createdAt, member.funding?.createdAt])
    if (state.feeFunding != null) times.push(state.feeFunding.createdAt)
    const stamps = times.filter((at): at is number => at != null)
    items.push({
      kind: 'event',
      id: 'all-signed',
      at: Math.max(...stamps),
      text: 'All signatures in',
      tone: 'mint'
    })
  }

  for (const message of messages) {
    items.push({ kind: 'message', id: message.id, at: message.createdAt, ownerId: message.ownerId, text: message.text })
  }

  // The summary of a set of signatures must follow the last of them at an equal timestamp
  const rank = (item: TimelineItem): number => item.kind === 'event' && item.id === 'all-signed' ? 1 : 0
  return items.sort((a, b) => a.at - b.at || rank(a) - rank(b) || a.id.localeCompare(b.id))
}