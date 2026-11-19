import { Fragment, type ReactNode } from 'react'
import { pluralize, relativeTime } from '../../lib/format'
import type { PoolChanges } from '../../lib/seen'
import { StatusBadge } from '../bits'

/** What changed since this pool was last on screen. Built from the pool state already loaded — no queries */
export function SinceLastVisit ({ changes }: { changes: PoolChanges }): ReactNode {
  const items: ReactNode[] = []
  if (changes.statusFrom != null) {
    items.push(
      <span key='status' className='flex items-center gap-2'>
        <StatusBadge status={changes.statusFrom} size='sm' />
        <span className='text-muted' aria-hidden>→</span>
        <StatusBadge status={changes.statusTo} size='sm' />
      </span>
    )
  }
  if (changes.consents > 0) items.push(<span key='consents'>{pluralize(changes.consents, 'new consent signature')}</span>)
  if (changes.fundings > 0) items.push(<span key='fundings'>{pluralize(changes.fundings, 'new funding signature')}</span>)
  if (changes.members > 0) items.push(<span key='members'>{pluralize(changes.members, 'new member')}</span>)

  return (
    <div className='mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line/60 bg-surface-2 px-4 py-3 text-small'>
      <span className='font-bold'>Since your last visit</span>
      <span className='text-muted'>({relativeTime(changes.since)})</span>
      {items.map((item, i) => (
        <Fragment key={i}>
          <span className='text-muted' aria-hidden>·</span>
          {item}
        </Fragment>
      ))}
    </div>
  )
}