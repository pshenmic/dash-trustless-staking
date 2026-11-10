import type { ReactNode } from 'react'
import type { PoolState } from '../../data/queries'
import { formatDash, formatDateTime, relativeTime } from '../../lib/format'
import { IdentityChip } from '../bits'
import { cn } from '../ui'

interface TimelineEvent {
  at: number | null
  who?: string
  text: string
  tone?: 'brand' | 'mint' | 'red'
}

/** Timeline assembled from the pool's documents and chain state */
export function ActivityTab ({ state }: { state: PoolState }): ReactNode {
  const events: TimelineEvent[] = [
    { at: state.pool.createdAt, who: state.pool.ownerId, text: 'created the pool', tone: 'brand' as const },
    ...state.joins.map(j => ({ at: j.createdAt, who: j.ownerId, text: `joined with ${formatDash(j.amount)}` })),
    ...(state.lock == null ? [] : [{ at: state.lock.createdAt, who: state.lock.ownerId, text: `locked the pool with ${state.members.length} members`, tone: 'brand' as const }]),
    ...state.members.flatMap(m => [
      ...(m.consent == null ? [] : [{ at: m.consent.createdAt, who: m.join.ownerId, text: 'signed their consent' }]),
      ...(m.funding == null ? [] : [{ at: m.funding.createdAt, who: m.join.ownerId, text: 'signed their coins' }])
    ])
  ].sort((a, b) => (b.at ?? 0) - (a.at ?? 0))

  // Chain events have block heights, not timestamps: they go on top
  const chainEvents: TimelineEvent[] = []
  if (state.regTx != null) {
    chainEvents.push(state.regTx.height == null
      ? { at: null, text: 'Registration broadcast, waiting for a block' }
      : { at: null, text: `Registered on chain at block ${state.regTx.height.toLocaleString('en-US')}`, tone: 'mint' })
  }
  if (state.status === 'REGISTERED') chainEvents.unshift({ at: null, text: 'Registered; waiting for the operator to set the service address', tone: 'mint' })
  if (state.status === 'ERROR') chainEvents.unshift({ at: null, text: 'Masternode is not valid (PoSe-banned or revoked)', tone: 'red' })
  if (state.status === 'DISSOLVED') chainEvents.unshift({ at: null, text: 'Masternode dissolved', tone: 'red' })

  return (
    <ol className='relative flex flex-col gap-5 border-l border-line pl-6'>
      {[...chainEvents, ...events].map((e, i) => (
        <li key={i} className='relative'>
          <span className={cn(
            'absolute top-1.5 -left-[29px] size-2.5 rounded-full ring-4 ring-surface',
            e.tone === 'brand' ? 'bg-brand' : e.tone === 'mint' ? 'bg-mint' : e.tone === 'red' ? 'bg-red' : 'bg-line'
          )}
          />
          <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-small'>
            {e.who != null && <IdentityChip id={e.who} size='sm' />}
            <span>{e.text}</span>
          </div>
          {e.at != null && <time className='text-tag text-muted' title={formatDateTime(e.at)}>{relativeTime(e.at)}</time>}
        </li>
      ))}
    </ol>
  )
}
