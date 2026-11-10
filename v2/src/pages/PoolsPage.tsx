import { Input, Select } from 'dash-ui-kit/react'
import { Button } from '../components/Button'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PoolCard } from '../components/PoolCard'
import { Chip, EmptyState, PageHeader, Skeleton } from '../components/ui'
import { useQuery } from '@tanstack/react-query'
import { backend } from '../data'
import { usePoolSummaries } from '../hooks/data'
import { isBlsPublicKey } from '../lib/rules'
import type { PoolSummary } from '../data/queries'

type Filter = 'all' | 'NEW' | 'LOCKED'
type Sort = 'newest' | 'filled' | 'fee'

const SORTS: Record<Sort, (a: PoolSummary, b: PoolSummary) => number> = {
  newest: (a, b) => b.pool.createdAt - a.pool.createdAt,
  filled: (a, b) => b.joinedTotal - a.joinedTotal,
  fee: (a, b) => a.pool.operatorReward - b.pool.operatorReward
}

export function PoolsPage (): ReactNode {
  const { data, isLoading, error } = usePoolSummaries()
  const [filter, setFilter] = useState<Filter>('NEW')
  const [sort, setSort] = useState<Sort>('newest')
  const [query, setQuery] = useState('')
  const [noPenalty, setNoPenalty] = useState(false)

  // An operator key in the search box goes through the operatorPubKey index, across all statuses
  const keyQuery = query.trim().toLowerCase()
  const byKey = useQuery({
    queryKey: ['pools-by-key', keyQuery],
    queryFn: async () => await backend.platform.listPoolsByOperatorKey(keyQuery),
    enabled: isBlsPublicKey(keyQuery)
  })

  const pools = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (isBlsPublicKey(q)) {
      const ids = new Set((byKey.data ?? []).map(p => p.id))
      return (data ?? []).filter(s => ids.has(s.pool.id)).sort(SORTS[sort])
    }
    return (data ?? [])
      .filter(s => filter === 'all' || s.listStatus === filter)
      .filter(s => !noPenalty || s.pool.earlyPenalty === 0)
      .filter(s => q === '' || s.pool.name.toLowerCase().includes(q) || s.pool.description.toLowerCase().includes(q))
      .sort(SORTS[sort])
  }, [data, filter, sort, query, noPenalty, byKey.data])

  const counts = {
    all: data?.length ?? 0,
    NEW: data?.filter(s => s.listStatus === 'NEW').length ?? 0,
    LOCKED: data?.filter(s => s.listStatus === 'LOCKED').length ?? 0
  }

  return (
    <div>
      <PageHeader
        title='Pools'
        subtitle='Each pool is one shared masternode. Join an open pool, or open your own.'
        actions={<Link to='/pools/new'><Button colorScheme='brand' size='md'>Create a pool</Button></Link>}
      />

      <div className='mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-wrap gap-2'>
          <Chip active={filter === 'NEW'} onClick={() => setFilter('NEW')}>Open · {counts.NEW}</Chip>
          <Chip active={filter === 'LOCKED'} onClick={() => setFilter('LOCKED')}>Locked · {counts.LOCKED}</Chip>
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All · {counts.all}</Chip>
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
              { value: 'filled', label: 'Most joined' },
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
          action={<Link to='/pools/new'><Button colorScheme='lightBlue' size='sm'>Create a pool</Button></Link>}
        >
          Try another filter, or open a pool yourself.
        </EmptyState>
      )}
      {pools.length > 0 && (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {pools.map(s => <PoolCard key={s.pool.id} summary={s} />)}
        </div>
      )}
    </div>
  )
}
