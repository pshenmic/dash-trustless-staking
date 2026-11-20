import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { PoolSummary } from '../data/queries'
import { usePoolState } from '../hooks/data'
import { COLLATERAL } from '../lib/consensus'
import { blocksToDuration, formatBasisPoints, pluralize, relativeTime } from '../lib/format'
import { isNewPool } from '../lib/recency'
import { changesSince, type PoolSnapshot } from '../lib/seen'
import { Dash, FillBar, IdentityChip, StatusBadge } from './bits'
import { Flag, hasLocation, locationText } from './Flag'
import { cn } from './ui'

export function PoolCard ({ summary, seen }: { summary: PoolSummary, seen: PoolSnapshot | null }): ReactNode {
  const { pool, listStatus, joinCount, joinedTotal } = summary
  const open = listStatus === 'NEW'
  const changed = useChangedSince(seen, summary)
  const recent = isNewPool(pool.createdAt)
  return (
    <Link
      to={`/pools/${pool.id}`}
      className='group flex flex-col rounded-3xl border border-line/60 bg-surface p-5 shadow-card transition-[transform,border-color] hover:-translate-y-0.5 hover:border-brand/50'
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          {/* Inverse emphasis: a pool with nothing new since your visit steps back, one with something new keeps full contrast */}
          <div className='flex min-w-0 items-center gap-2'>
            <h3 className={cn(
              'truncate text-lead tracking-[-0.02em] group-hover:text-brand-ink',
              changed ? 'font-extrabold' : 'font-semibold text-muted'
            )}
            >
              {pool.name}
            </h3>
            {recent && (
              <span className='shrink-0 rounded-full bg-brand px-2 py-0.5 text-tag font-semibold text-white' title={`Created ${relativeTime(pool.createdAt)}`}>New pool</span>
            )}
          </div>
          <div className='mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1'>
            <IdentityChip id={pool.ownerId} size='sm' />
            {hasLocation(pool) && (
              <span className='inline-flex items-center gap-1.5 text-tag text-muted'><Flag country={pool.location} />{locationText(pool.location)}</span>
            )}
          </div>
        </div>
        <StatusBadge status={listStatus} size='sm' dot={false} />
      </div>

      <div className='mt-5'>
        <div className='mb-2 flex items-baseline justify-between gap-2 text-small'>
          <span>
            <Dash duffs={joinedTotal} className='text-lead font-extrabold' />
            <span className='text-muted'> / {COLLATERAL / 1e8} DASH</span>
          </span>
          <span className='text-muted'>{pluralize(joinCount, open ? 'join' : 'member')}</span>
        </div>
        <FillBar joined={joinedTotal} />
        {open && joinedTotal > COLLATERAL && (
          <div className='mt-1.5 text-tag text-muted'>More joins than needed: the creator picks members</div>
        )}
      </div>

      <dl className='mt-5 grid grid-cols-3 gap-2 text-small'>
        <Term label='Operator fee' value={formatBasisPoints(pool.operatorReward)} />
        <Term label='Early exit' value={pool.earlyPenalty === 0 ? 'Free' : <Dash duffs={pool.earlyPenalty} />} />
        <Term label='Early period' value={pool.earlyPeriodBlocks === 0 ? 'None' : blocksToDuration(pool.earlyPeriodBlocks)} />
      </dl>

      <div className='mt-4 text-tag text-muted'>Created {relativeTime(pool.createdAt)}</div>
    </Link>
  )
}

function Term ({ label, value }: { label: string, value: ReactNode }): ReactNode {
  return (
    <div className='rounded-2xl bg-surface-2 px-3 py-2'>
      <dt className='text-tag text-muted'>{label}</dt>
      <dd className='mt-0.5 font-bold'>{value}</dd>
    </div>
  )
}

/**
 * True when the pool holds something the stored visit has not seen: never opened here, a join landed,
 * the pool got locked, or — for a locked pool — a new signature or a move through signing/registration.
 * An Open pool needs no query: joins and the lock are the whole of its visible state, and both are in
 * the summary. A locked pool's signatures and chain status are not, so they come from the pool's state
 * (the same cache entry the pool page reads, fetched once, never polled from the grid).
 */
function useChangedSince (seen: PoolSnapshot | null, summary: PoolSummary): boolean {
  const { lock, joinCount } = summary
  const { data: state } = usePoolState(summary.pool.id, { enabled: seen != null && lock != null, poll: false })
  if (seen == null) return true
  const now = lock == null
    ? { status: 'NEW' as const, consents: 0, fundings: 0, members: joinCount }
    : state == null
      ? null
      : {
          status: state.status,
          consents: state.consentCount,
          fundings: state.fundingCount,
          members: state.lock == null ? state.joins.length : state.members.length
        }
  // Unknown yet reads as "nothing new": a circle that appears late beats one that lies for a second
  return now != null && changesSince(seen, now) != null
}
