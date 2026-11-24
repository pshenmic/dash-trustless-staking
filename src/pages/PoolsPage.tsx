import { Input, Select } from 'dash-ui-kit/react'
import { Button } from '../components/Button'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { GenerationBanner } from '../components/GenerationBanner'
import { PoolCard } from '../components/PoolCard'
import { Chip, EmptyState, PageHeader, Skeleton } from '../components/ui'
import { useQuery } from '@tanstack/react-query'
import { backend, platformFor } from '../data'
import { createQuickPool } from '../data/mock/mockBackend'
import { usePoolSummaries, useWrite } from '../hooks/data'
import { useHiddenPools } from '../hooks/useHiddenPools'
import { useSeenSnapshots } from '../hooks/useSeen'
import { useGeneration } from '../generations'
import { isBlsPublicKey } from '../lib/rules'
import { useWallet } from '../wallet/WalletContext'
import type { PoolSummary } from '../data/queries'

type Filter = 'all' | 'NEW' | 'LOCKED' | 'hidden'
type Sort = 'newest' | 'filled' | 'fee'

const SORTS: Record<Sort, (a: PoolSummary, b: PoolSummary) => number> = {
  newest: (a, b) => b.pool.createdAt - a.pool.createdAt,
  filled: (a, b) => b.joinedTotal - a.joinedTotal,
  fee: (a, b) => a.pool.operatorReward - b.pool.operatorReward
}

export function PoolsPage (): ReactNode {
  const { data, isLoading, error } = usePoolSummaries()
  const seenPools = useSeenSnapshots()
  const { hidden, toggleHidden } = useHiddenPools()
  const { ref, base } = useGeneration()
  const navigate = useNavigate()
  const { activeIdentity } = useWallet()
  const quickPool = useWrite(async () => createQuickPool(activeIdentity))
  const [filter, setFilter] = useState<Filter>('NEW')
  const [sort, setSort] = useState<Sort>('newest')
  const [query, setQuery] = useState('')
  const [noPenalty, setNoPenalty] = useState(false)

  // An operator key in the search box goes through the operatorPubKey index, across all statuses
  const keyQuery = query.trim().toLowerCase()
  const byKey = useQuery({
    queryKey: ['pools-by-key', ref.slug, keyQuery],
    queryFn: async () => await platformFor(ref).listPoolsByOperatorKey(keyQuery),
    enabled: isBlsPublicKey(keyQuery)
  })

  // Archived pools stay readable but sink below everything else, whatever the chosen sort
  const archivedLast = (a: PoolSummary, b: PoolSummary): number =>
    a.pool.archived === b.pool.archived ? 0 : a.pool.archived ? 1 : -1

  const pools = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (isBlsPublicKey(q)) {
      const ids = new Set((byKey.data ?? []).map(p => p.id))
      return (data ?? [])
        .filter(s => ids.has(s.pool.id) && hidden.has(s.pool.id) === (filter === 'hidden'))
        .sort((a, b) => archivedLast(a, b) || SORTS[sort](a, b))
    }
    // The hidden view is the only place hidden pools appear, and it is the only way to bring one back
    return (data ?? [])
      .filter(s => hidden.has(s.pool.id) === (filter === 'hidden'))
      .filter(s => filter === 'hidden' || filter === 'all' || s.listStatus === filter)
      .filter(s => !noPenalty || s.pool.earlyPenalty === 0)
      .filter(s => q === '' || s.pool.name.toLowerCase().includes(q) || s.pool.description.toLowerCase().includes(q))
      .sort((a, b) => archivedLast(a, b) || SORTS[sort](a, b))
  }, [data, filter, sort, query, noPenalty, byKey.data, hidden])

  const counts = {
    all: data?.filter(s => !hidden.has(s.pool.id)).length ?? 0,
    hidden: hidden.size,
    NEW: data?.filter(s => !hidden.has(s.pool.id) && s.listStatus === 'NEW').length ?? 0,
    LOCKED: data?.filter(s => !hidden.has(s.pool.id) && s.listStatus === 'LOCKED').length ?? 0
  }

  return (
    <div>
      <PageHeader
        title='Pools'
        subtitle='Each pool is one shared masternode. Take a share in an open pool, or open your own.'
        actions={ref.canWrite
          ? (
            <div className='flex flex-wrap gap-2'>
              {backend.mode === 'mock' && (
                <Button
                  colorScheme='mint'
                  size='md'
                  disabled={quickPool.isPending}
                  onClick={() => quickPool.mutate(undefined, { onSuccess: pool => navigate(`${base}/pools/${pool.id}`) })}
                >
                  {quickPool.isPending ? 'Creating…' : 'Quick test pool'}
                </Button>
              )}
              <Link to='/pools/new'><Button colorScheme='brand' size='md'>Create a pool</Button></Link>
            </div>
            )
          : <span className='text-small text-muted'>No new pools on this version</span>}
      />

      <GenerationBanner />

      <div className='mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-wrap gap-2'>
          <Chip active={filter === 'NEW'} onClick={() => setFilter('NEW')}>Open · {counts.NEW}</Chip>
          <Chip active={filter === 'LOCKED'} onClick={() => setFilter('LOCKED')}>Locked · {counts.LOCKED}</Chip>
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All · {counts.all}</Chip>
          {(counts.hidden > 0 || filter === 'hidden') && (
            <Chip active={filter === 'hidden'} onClick={() => setFilter('hidden')}>Hidden · {counts.hidden}</Chip>
          )}
          <Chip active={noPenalty} onClick={() => setNoPenalty(v => !v)}>No early penalty</Chip>
        </div>
        <div className='flex gap-2'>
          <div className='min-w-0 flex-1 lg:w-56 lg:flex-none'>
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
              { value: 'filled', label: 'Most funded' },
              { value: 'fee', label: 'Lowest operator fee' }
            ]}
            className='w-44 shrink-0 sm:w-52'
          />
        </div>
      </div>

      {error != null && <EmptyState title='Could not load pools'>{String(error)}</EmptyState>}
      {isLoading && (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className='h-64' />)}
        </div>
      )}
      {data != null && pools.length === 0 && (
        <EmptyState
          title='No pools match'
          action={ref.canWrite ? <Link to='/pools/new'><Button colorScheme='lightBlue' size='sm'>Create a pool</Button></Link> : undefined}
        >
          Try another filter, or open a pool yourself.
        </EmptyState>
      )}
      {pools.length > 0 && (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {pools.map(s => (
            <PoolCard
              key={s.pool.id}
              summary={s}
              seen={seenPools[s.pool.id] ?? null}
              hidden={hidden.has(s.pool.id)}
              onToggleHidden={() => {
                toggleHidden(s.pool.id)
                // Restoring the last hidden pool leaves the hidden view empty, so fall back to all pools
                if (filter === 'hidden' && hidden.size === 1 && hidden.has(s.pool.id)) setFilter('all')
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}