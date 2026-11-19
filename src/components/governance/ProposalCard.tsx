import { useState, type ReactNode } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { ProposalStats } from '../../lib/governanceStats'
import { formatDash, relativeTime } from '../../lib/format'
import { Button } from '../Button'
import { Card, IdentifierValue } from '../ui'
import { SentimentView } from './SentimentView'
import { OUTCOME_HEX } from './outcome'

/** One proposal: donut with a stake↔pool-count toggle, participation, leading outcome, expand to per-pool tallies */
export function ProposalCard ({ stats }: { stats: ProposalStats }): ReactNode {
  const [unit, setUnit] = useState<'stake' | 'count'>('stake')
  const [open, setOpen] = useState(false)
  const split = unit === 'stake' ? stats.stake : stats.count
  const data = [
    { name: 'YES', value: split.yes, fill: OUTCOME_HEX[1] },
    { name: 'NO', value: split.no, fill: OUTCOME_HEX[2] },
    { name: 'ABSTAIN', value: split.abstain, fill: OUTCOME_HEX[3] }
  ]
  const total = split.yes + split.no + split.abstain
  const fmt = (v: number): string => unit === 'stake' ? formatDash(v) : `${v} pool${v === 1 ? '' : 's'}`
  const leadingLabel = stats.leading === 'tied' ? 'Tied' : stats.leading === 'yes' ? 'Leading YES' : 'Leading NO'
  return (
    <Card>
      <div className='flex flex-col gap-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <IdentifierValue value={stats.proposalHash} label='Proposal' />
          <span className='rounded-full bg-surface-2 px-3 py-1 text-tag font-bold'>{leadingLabel}</span>
        </div>
        <div className='flex flex-wrap items-center gap-4'>
          <div className='h-32 w-32 shrink-0'>
            {total === 0
              ? <div className='flex h-full w-full items-center justify-center rounded-full border-8 border-line text-tag text-muted'>—</div>
              : (
                <ResponsiveContainer width='100%' height='100%'>
                  <PieChart>
                    <Pie data={data} dataKey='value' nameKey='name' innerRadius={38} outerRadius={60} paddingAngle={2} stroke='none'>
                      {data.map(d => <Cell key={d.name} fill={d.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </div>
          <div className='flex flex-col gap-1 text-small'>
            {data.map(d => (
              <span key={d.name} className='flex items-center gap-2'>
                <span className='size-2.5 rounded-full' style={{ background: d.fill }} />
                <span className='font-bold'>{d.name}</span>
                <span className='text-muted'>{fmt(d.value)}</span>
              </span>
            ))}
            <button type='button' className='mt-1 self-start text-tag font-bold text-brand-ink hover:underline' onClick={() => setUnit(u => u === 'stake' ? 'count' : 'stake')}>
              Show {unit === 'stake' ? 'pool count' : 'stake (DASH)'}
            </button>
          </div>
        </div>
        <p className='text-tag text-muted'>
          Participation: {stats.participation.poolsVoted}/{stats.participation.totalPools} pools · {formatDash(stats.participation.stakeVoted)} voted · {stats.participation.membersVoted}/{stats.participation.totalMembers} members · margin {Math.round(stats.margin * 100)}% · {relativeTime(stats.lastActivity)}
        </p>
        <div>
          <Button size='sm' colorScheme='brand' onClick={() => setOpen(o => !o)}>{open ? 'Hide pools' : 'Show pools'}</Button>
        </div>
        {open && <SentimentView sentiment={{ proposalHash: stats.proposalHash, pools: stats.pools, overall: stats.count }} />}
      </div>
    </Card>
  )
}