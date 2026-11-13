import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { PoolSummary } from '../data/queries'
import { COLLATERAL } from '../lib/consensus'
import { blocksToDuration } from '../lib/format'
import { earlyExitLabel, operatorLabel, poolListTag } from '../lib/presentation'
import { Dash, FillBar, IdentityChip } from './bits'
import { Flag, hasLocation, locationText } from './Flag'
import { PoolTile } from './PoolTile'
import { cn } from './ui'

export function PoolCard ({ summary }: { summary: PoolSummary }): ReactNode {
  const { pool, listStatus, joinCount, joinedTotal } = summary
  const tag = poolListTag(listStatus)
  const operator = operatorLabel(pool)
  const free = pool.earlyPenalty === 0

  return (
    <Link
      to={`/pools/${pool.id}`}
      className='group flex flex-col rounded-[20px] bg-surface p-5 shadow-card transition-[transform] hover:-translate-y-0.5'
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <PoolTile name={pool.name} id={pool.id} />
          <div className='min-w-0'>
            <h3 className='truncate text-[17px] leading-6 font-extrabold tracking-[-0.02em] group-hover:text-brand-ink'>{pool.name}</h3>
            <div className='mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
              <span className={cn('rounded-full px-2 py-0.5 text-tag font-bold uppercase tracking-[0.06em]', tag.tone === 'orange' ? 'bg-orange-soft text-orange-ink' : 'bg-brand-soft text-brand-ink')}>
                {tag.label}
              </span>
              <IdentityChip id={pool.ownerId} size='sm' />
            </div>
          </div>
        </div>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-tag font-bold', free ? 'bg-mint-soft text-mint-ink' : 'bg-orange-soft text-orange-ink')}>
          {earlyExitLabel(pool.earlyPenalty)}
        </span>
      </div>

      <div className='mt-4 border-t border-line/70 pt-4'>
        <FillBar joined={joinedTotal} />
        <div className='mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-small'>
          <span className='flex items-baseline gap-1.5'>
            <Dash duffs={joinedTotal} className='text-[17px] font-extrabold' />
            <span className='inline-flex items-center gap-1 text-muted' title={`${joinCount} ${joinCount === 1 ? 'share' : 'shares'}`}>
              <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' aria-hidden>
                <circle cx='9' cy='8' r='3.5' /><path d='M2.5 20c1.2-3.3 3.7-5 6.5-5s5.3 1.7 6.5 5' />
                <path d='M16 5.5a3 3 0 0 1 0 5.5M18.5 20c-.4-1.4-1-2.6-1.8-3.6' />
              </svg>
              {joinCount}
            </span>
          </span>
          <span className='flex items-center gap-2 text-muted'>
            / {COLLATERAL / 1e8} DASH
            <span className='rounded-full bg-brand-soft px-2 py-0.5 text-tag font-bold text-brand-ink'>Masternode</span>
          </span>
        </div>
      </div>

      <dl className='mt-4 flex flex-col gap-1 text-small'>
        <div className='flex gap-2'>
          <dt className='text-muted'>Operator:</dt>
          <dd className='min-w-0 truncate font-semibold'>{operator.name} · {operator.fee}</dd>
        </div>
        {hasLocation(pool)
          ? (
            <div className='flex items-center gap-2'>
              <dt className='text-muted'>Location:</dt>
              <dd className='flex items-center gap-1.5 font-semibold'><Flag country={pool.location} />{locationText(pool.location)}</dd>
            </div>
            )
          : (
            <div className='flex gap-2'>
              <dt className='text-muted'>Early period:</dt>
              <dd className='font-semibold'>{pool.earlyPeriodBlocks === 0 ? 'None' : blocksToDuration(pool.earlyPeriodBlocks)}</dd>
            </div>
            )}
      </dl>

      <div className='mt-auto flex justify-end pt-4'>
        <span className='rounded-full bg-brand px-4 py-2 text-small font-bold text-white'>More info</span>
      </div>
    </Link>
  )
}