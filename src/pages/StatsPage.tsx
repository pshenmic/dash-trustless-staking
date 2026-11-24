import { useMemo, type ReactNode } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { Dash } from '../components/bits'
import { LockedChart } from '../components/home/LockedChart'
import { errorMessage } from '../components/Toast'
import { Card, Loading, Notice, PageHeader, Stat } from '../components/ui'
import { useStatsSource } from '../hooks/data'
import { homeStats } from '../lib/homeStats'
import { poolStages, shareSizeBuckets } from '../lib/stats'

/** Ordered: the colour deepens as the pools get further, and every slice is named in the list beside it */
const STAGE_COLORS = ['#60a5fa', '#3b82f6', '#1d4ed8']
const BUCKET_COLORS = ['#60a5fa', '#3b82f6', '#2563eb', '#4f46e5', '#7c3aed']

interface Slice {
  key: string
  label: string
  value: number
  color: string
}

export function StatsPage (): ReactNode {
  const { data, isLoading, error } = useStatsSource()
  const totals = useMemo(() => data == null ? null : homeStats(data.pools, data.locks, data.joins), [data])
  const stages = useMemo<Slice[]>(() => data == null
    ? []
    : poolStages(data.pools, data.locks, data.joins)
      .map((stage, i) => ({ key: stage.key, label: stage.label, value: stage.count, color: STAGE_COLORS[i] ?? STAGE_COLORS[0] })), [data])
  const buckets = useMemo<Slice[]>(() => data == null
    ? []
    : shareSizeBuckets(data.joins)
      .map((bucket, i) => ({ key: bucket.label, label: `${bucket.label} DASH`, value: bucket.count, color: BUCKET_COLORS[i] ?? BUCKET_COLORS[0] })), [data])

  return (
    <div className='flex flex-col gap-10'>
      <PageHeader
        title='Statistics'
        subtitle='Everything the numbers on the home page come from, measured from Platform documents alone.'
      />

      {error != null && <Notice tone='error' title='Could not load the pool statistics'>{errorMessage(error)}</Notice>}

      {isLoading || data == null || totals == null
        ? <Loading />
        : (
          <>
            <section className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <Stat label='DASH locked' value={<Dash duffs={totals.locked} />} hint={`${totals.lockedPools} locked ${totals.lockedPools === 1 ? 'pool' : 'pools'}`} />
              <Stat label='DASH pooled' value={<Dash duffs={totals.pooled} />} hint={`${totals.openPools} open ${totals.openPools === 1 ? 'pool' : 'pools'}`} />
              <Stat label='Shares' value={totals.shares} hint={`${totals.members} ${totals.members === 1 ? 'member' : 'members'}`} />
              <Stat label='Pools' value={totals.pools} hint='All generations on this route' />
            </section>

            <section>
              <h2 className='text-title'>DASH locked over time</h2>
              <div className='mt-6'><LockedChart points={totals.lockedPoints} /></div>
            </section>

            <section className='grid grid-cols-1 gap-8 lg:grid-cols-2'>
              <div>
                <h2 className='text-title'>Where pools get to</h2>
                <p className='mt-2 text-small text-muted'>
                  Every pool at one of three stages: still forming, filled but not locked, or locked by the creator.
                  Registration needs chain state and is not counted here.
                </p>
                <Card className='mt-6'>
                  <SlicePie slices={stages} unit='pool' />
                </Card>
              </div>

              <div>
                <h2 className='text-title'>Share sizes</h2>
                <p className='mt-2 text-small text-muted'>
                  Current shares in DASH, one document per member after top-ups are folded.
                </p>
                <Card className='mt-6'>
                  <SlicePie slices={buckets} unit='share' />
                </Card>
              </div>
            </section>
          </>
          )}
    </div>
  )
}

/**
 * A donut with its numbers written out beside it: the ring carries colour, the list carries the names,
 * counts and shares, so reading the chart never depends on telling two blues apart.
 */
function SlicePie ({ slices, unit }: { slices: Slice[], unit: string }): ReactNode {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const drawn = slices.filter(slice => slice.value > 0)

  return (
    <div className='flex flex-col items-center gap-6 sm:flex-row'>
      <div className='relative h-44 w-44 shrink-0'>
        {drawn.length === 0
          ? <div className='h-full w-full rounded-full border-8 border-surface-2' />
          : (
            <ResponsiveContainer width='100%' height='100%'>
              <PieChart>
                <Pie
                  data={drawn}
                  dataKey='value'
                  nameKey='label'
                  innerRadius={52}
                  outerRadius={86}
                  paddingAngle={2}
                  stroke='none'
                  isAnimationActive={false}
                >
                  {drawn.map(slice => <Cell key={slice.key} fill={slice.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            )}
        <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
          <span className='text-2xl leading-none font-extrabold'>{total}</span>
          <span className='mt-1 text-tag text-muted'>{total === 1 ? unit : `${unit}s`}</span>
        </div>
      </div>

      <ul className='flex w-full min-w-0 flex-col gap-2.5'>
        {slices.map(slice => (
          <li key={slice.key} className='flex items-center gap-2.5 text-small'>
            <span className='h-2.5 w-2.5 shrink-0 rounded-full' style={{ background: slice.color }} />
            <span className='min-w-0 flex-1 text-muted'>{slice.label}</span>
            <span className='font-bold tabular-nums'>{slice.value}</span>
            <span className='w-11 text-right text-muted tabular-nums'>
              {total === 0 ? '—' : `${Math.round(slice.value / total * 100)}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}