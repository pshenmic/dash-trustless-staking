import type { ReactNode } from 'react'
import type { Overview } from '../../lib/governanceStats'
import { blocksToDuration, formatVotingPower } from '../../lib/format'
import { Card } from '../ui'

function Stat ({ label, value, hint }: { label: string, value: ReactNode, hint?: ReactNode }): ReactNode {
  return (
    <Card className='flex flex-col gap-1'>
      <span className='text-tag text-muted'>{label}</span>
      <span className='text-xl font-bold'>{value}</span>
      {hint != null && <span className='text-tag text-muted'>{hint}</span>}
    </Card>
  )
}

export function OverviewCards ({ overview }: { overview: Overview }): ReactNode {
  const blocks = Math.max(0, overview.lockHeight - overview.height)
  return (
    <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
      <Stat label='Active pools' value={overview.activePools} />
      <Stat label='Proposals' value={overview.proposalCount} />
      <Stat label='Voting power' value={formatVotingPower(overview.stakeVoting)} hint='1 unit = 1,000 DASH' />
      <Stat label='Choices recorded' value={overview.totalChoices} />
      <Stat label='Votes lock in' value={blocks > 0 ? blocksToDuration(blocks) : 'Locked'} />
    </div>
  )
}