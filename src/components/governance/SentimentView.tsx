import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { ProposalSentiment } from '../../data/queries'
import { formatDash } from '../../lib/format'
import { outcomeLabel } from '../../lib/voting'
import { EmptyState } from '../ui'

/** Per-pool stake-weighted tallies on a proposal, shared by the in-tab panel and the global drill-in */
export function SentimentView ({ sentiment, excludePoolId }: { sentiment: ProposalSentiment, excludePoolId?: string }): ReactNode {
  const pools = sentiment.pools.filter(p => p.pool.id !== excludePoolId)
  if (pools.length === 0) {
    return <EmptyState title='No other pools yet'>No other pool has recorded choices on this proposal.</EmptyState>
  }
  const yes = pools.filter(p => p.tally === 1).length
  const no = pools.filter(p => p.tally === 2).length
  const abstain = pools.filter(p => p.tally === 3).length
  return (
    <div className='flex flex-col gap-3'>
      <p className='text-tag text-muted'>{yes} pool{yes === 1 ? '' : 's'} YES · {no} NO · {abstain} ABSTAIN</p>
      <ul className='flex flex-col gap-2'>
        {pools.map(p => (
          <li key={p.pool.id} className='flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 text-small'>
            <Link to={`/pools/${p.pool.id}`} className='font-bold text-brand-ink hover:underline'>{p.pool.name}</Link>
            <span className='flex items-center gap-3'>
              <span className='font-bold'>{outcomeLabel(p.tally)}</span>
              <span className='text-muted'>{formatDash(p.votedStake)} / {formatDash(p.totalStake)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className='text-tag text-muted'>Recorded choices across pools using the shared voting service.</p>
    </div>
  )
}