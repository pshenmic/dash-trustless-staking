import type { ReactNode } from 'react'
import type { Vote } from '../../lib/types'
import { relativeTime, shortId } from '../../lib/format'
import { IdentityChip } from '../bits'
import { cn, Card, EmptyState, Loading } from '../ui'
import { OUTCOME_LABEL, OUTCOME_TEXT } from './outcome'

/** Individual choice log: one row per vote (member · pool · outcome · proposal · time), newest first */
export function ChoiceLog ({ votes, loading, error, poolNames }: { votes: Vote[], loading: boolean, error: unknown, poolNames: Map<string, string> }): ReactNode {
  return (
    <Card>
      <span className='text-small font-bold'>Recent recorded choices</span>
      {error != null && <EmptyState title='Could not load activity'>{String(error)}</EmptyState>}
      {error == null && loading && <Loading />}
      {error == null && !loading && votes.length === 0 && (
        <EmptyState title='No choices yet'>Member choices appear here as they are recorded.</EmptyState>
      )}
      {error == null && votes.length > 0 && (
        <ul className='mt-3 flex flex-col gap-2'>
          {votes.map(v => (
            <li key={v.id} className='flex flex-wrap items-center gap-x-2 gap-y-1 text-tag'>
              <IdentityChip id={v.ownerId} size='sm' />
              <span className='text-muted'>{poolNames.get(v.poolId) ?? shortId(v.poolId)}</span>
              <span className={cn('font-bold', OUTCOME_TEXT[v.outcome])}>{OUTCOME_LABEL[v.outcome]}</span>
              <span className='font-mono text-muted' title={v.proposalHash}>{shortId(v.proposalHash, 6)}</span>
              <span className='text-muted'>{relativeTime(v.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}