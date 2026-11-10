import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { PoolSummary } from '../data/queries'
import { COLLATERAL } from '../lib/consensus'
import { blocksToDuration, formatBasisPoints, pluralize, relativeTime } from '../lib/format'
import { Dash, FillBar, IdentityChip, StatusBadge } from './bits'
import { Flag, hasLocation, locationText } from './Flag'

export function PoolCard ({ summary }: { summary: PoolSummary }): ReactNode {
  const { pool, listStatus, joinCount, joinedTotal } = summary
  const open = listStatus === 'NEW'
  return (
    <Link
      to={`/pools/${pool.id}`}
      className='group flex flex-col rounded-3xl border border-line/60 bg-surface p-5 shadow-card transition-[transform,border-color] hover:-translate-y-0.5 hover:border-brand/50'
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h3 className='truncate text-lead font-extrabold tracking-[-0.02em] group-hover:text-brand-ink'>{pool.name}</h3>
          <div className='mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1'>
            <IdentityChip id={pool.ownerId} size='sm' />
            {hasLocation(pool) && (
              <span className='inline-flex items-center gap-1.5 text-tag text-muted'><Flag country={pool.location} />{locationText(pool.location)}</span>
            )}
          </div>
        </div>
        <StatusBadge status={listStatus} size='sm' />
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
