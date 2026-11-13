import { Input, Select } from 'dash-ui-kit/react'
import { Button } from '../components/Button'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PoolCard } from '../components/PoolCard'
import { cn, EmptyState, PageHeader, Skeleton } from '../components/ui'
import { useQuery } from '@tanstack/react-query'
import { backend } from '../data'
import { useMyActivity, usePoolSummaries } from '../hooks/data'
import { isBlsPublicKey } from '../lib/rules'
import { gridClass, type GridDensity } from '../lib/presentation'
import { useSettings } from '../lib/settings'
import { useWallet } from '../wallet/WalletContext'
import type { PoolSummary } from '../data/queries'

type Filter = 'NEW' | 'LOCKED' | 'all' | 'mine'
type Sort = 'newest' | 'filled' | 'fee'

const SORTS: Record<Sort, (a: PoolSummary, b: PoolSummary) => number> = {
  newest: (a, b) => b.pool.createdAt - a.pool.createdAt,
  filled: (a, b) => b.joinedTotal - a.joinedTotal,
  fee: (a, b) => a.pool.operatorReward - b.pool.operatorReward
}

const NEXT_DENSITY: Record<GridDensity, GridDensity> = { auto: 4, 4: 3, 3: 2, 2: 'auto' }

export function PoolsPage (): ReactNode {
  const { activeIdentity } = useWallet()
  const { settings, update } = useSettings()
  const { data, isLoading, error } = usePoolSummaries()
  const { data: mine } = useMyActivity(activeIdentity)
  const [filter, setFilter] = useState<Filter>('NEW')
  const [sort, setSort] = useState<Sort>('newest')
  const [query, setQuery] = useState('')
  const [noPenalty, setNoPenalty] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // An operator key in the search box goes through the operatorPubKey index, across all statuses
  const keyQuery = query.trim().toLowerCase()
  const byKey = useQuery({
    queryKey: ['pools-by-key', keyQuery],
    queryFn: async () => await backend.platform.listPoolsByOperatorKey(keyQuery),
    enabled: isBlsPublicKey(keyQuery)
  })

  const mineIds = useMemo(() => new Set([
    ...(mine?.created.map(state => state.pool.id) ?? []),
    ...(mine?.joined.map(entry => entry.state.pool.id) ?? [])
  ]), [mine])

  const pools = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (isBlsPublicKey(q)) {
      const ids = new Set((byKey.data ?? []).map(p => p.id))
      return (data ?? []).filter(s => ids.has(s.pool.id)).sort(SORTS[sort])
    }
    return (data ?? [])
      .filter(s => filter === 'all' ? true : filter === 'mine' ? mineIds.has(s.pool.id) : s.listStatus === filter)
      .filter(s => !noPenalty || s.pool.earlyPenalty === 0)
      .filter(s => q === '' || s.pool.name.toLowerCase().includes(q) || s.pool.description.toLowerCase().includes(q))
      .sort(SORTS[sort])
  }, [data, filter, sort, query, noPenalty, byKey.data, mineIds])

  const counts = {
    all: data?.length ?? 0,
    NEW: data?.filter(s => s.listStatus === 'NEW').length ?? 0,
    LOCKED: data?.filter(s => s.listStatus === 'LOCKED').length ?? 0,
    mine: data?.filter(s => mineIds.has(s.pool.id)).length ?? 0
  }

  return (
    <div>
      <PageHeader
        title='Pools'
        subtitle='Each pool is one shared masternode. Join an open pool, or open your own.'
        actions={<Link to='/pools/new'><Button colorScheme='brand' size='md'>Create a pool</Button></Link>}
      />

      <div className='mb-5 flex flex-wrap items-center gap-2'>
        <FilterPill active={filter === 'all'} tone='neutral' label='All' count={counts.all} onClick={() => setFilter('all')} />
        <FilterPill active={filter === 'NEW'} tone='orange' label='Filling' count={counts.NEW} onClick={() => setFilter('NEW')} />
        <FilterPill active={filter === 'LOCKED'} tone='blue' label='Filled' count={counts.LOCKED} onClick={() => setFilter('LOCKED')} />
        {activeIdentity != null && (
          <FilterPill active={filter === 'mine'} tone='mint' label='My' count={counts.mine} onClick={() => setFilter('mine')} />
        )}

        <div className='ml-auto flex items-center gap-2'>
          <div className='hidden w-56 lg:block'>
            <Input
              size='sm'
              placeholder='Search pools or operator key'
              value={query}
              onChange={e => setQuery(e.target.value)}
              className='w-full'
              aria-label='Search pools'
            />
          </div>
          <button
            type='button'
            onClick={() => update({ grid: NEXT_DENSITY[settings.grid] })}
            className='flex size-10 items-center justify-center rounded-[10px] bg-surface text-muted shadow-card transition-colors hover:text-fg'
            aria-label={`Grid density: ${settings.grid}`}
            title='Change grid density'
          >
            <GridIcon />
          </button>
          <button
            type='button'
            onClick={() => setFiltersOpen(open => !open)}
            className={cn(
              'flex size-10 items-center justify-center rounded-[10px] shadow-card transition-colors',
              filtersOpen ? 'bg-brand text-white' : 'bg-surface text-muted hover:text-fg'
            )}
            aria-expanded={filtersOpen}
            aria-label='Filters and sorting'
          >
            <FilterIcon />
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div className='mb-5 flex flex-col gap-3 rounded-[16px] bg-surface p-4 shadow-card md:flex-row md:items-center'>
          <div className='min-w-0 flex-1 lg:hidden'>
            <Input
              size='sm'
              placeholder='Search pools or operator key'
              value={query}
              onChange={e => setQuery(e.target.value)}
              className='w-full'
              aria-label='Search pools'
            />
          </div>
          <Select
            size='sm'
            value={sort}
            onChange={v => setSort(v as Sort)}
            options={[
              { value: 'newest', label: 'Newest' },
              { value: 'filled', label: 'Most joined' },
              { value: 'fee', label: 'Lowest operator fee' }
            ]}
            className='w-full shrink-0 md:w-52'
          />
          <button
            type='button'
            onClick={() => setNoPenalty(value => !value)}
            aria-pressed={noPenalty}
            className={cn(
              'rounded-full px-4 py-2 text-small font-semibold transition-colors',
              noPenalty ? 'bg-surface text-brand-ink ring-1 ring-brand/20' : 'bg-surface-2 text-muted hover:text-fg'
            )}
          >
            No early penalty
          </button>
        </div>
      )}

      {error != null && <EmptyState title='Could not load pools'>{String(error)}</EmptyState>}
      {isLoading && (
        <div className={cn('grid gap-4', gridClass(settings.grid))}>
          {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className='h-72' />)}
        </div>
      )}
      {data != null && pools.length === 0 && (
        <EmptyState
          title='No pools match'
          action={<Link to='/pools/new'><Button colorScheme='lightBlue' size='sm'>Create a pool</Button></Link>}
        >
          Try another filter, or open a pool yourself.
        </EmptyState>
      )}
      {pools.length > 0 && (
        <div className={cn('grid gap-4', gridClass(settings.grid))}>
          {pools.map(summary => <PoolCard key={summary.pool.id} summary={summary} />)}
        </div>
      )}
    </div>
  )
}

function FilterPill ({ active, tone, label, count, onClick }: {
  active: boolean
  tone: 'neutral' | 'orange' | 'blue' | 'mint'
  label: string
  count: number
  onClick: () => void
}): ReactNode {
  const tints = {
    neutral: 'bg-surface-2 text-muted',
    orange: 'bg-orange-soft text-orange-ink',
    blue: 'bg-brand-soft text-brand-ink',
    mint: 'bg-mint-soft text-mint-ink'
  }
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-2 rounded-full px-4 py-2 text-small font-bold transition-colors',
        active ? 'bg-surface text-fg shadow-card ring-1 ring-line/60' : tints[tone]
      )}
    >
      {label}
      <span className={cn(
        'rounded-full px-1.5 py-0.5 text-tag font-bold',
        active ? 'bg-brand text-white' : 'bg-surface text-muted'
      )}>
        {count}
      </span>
    </button>
  )
}

function GridIcon (): ReactNode {
  return (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' aria-hidden>
      <rect x='3' y='3' width='7' height='7' rx='2' /><rect x='14' y='3' width='7' height='7' rx='2' />
      <rect x='3' y='14' width='7' height='7' rx='2' /><rect x='14' y='14' width='7' height='7' rx='2' />
    </svg>
  )
}

function FilterIcon (): ReactNode {
  return (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' aria-hidden>
      <path d='M3 6h18M6 12h12M10 18h4' />
    </svg>
  )
}