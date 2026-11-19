import { useMemo, useState, type ReactNode } from 'react'
import { ChoiceLog } from '../components/governance/ChoiceLog'
import { Leaderboard } from '../components/governance/Leaderboard'
import { OverviewCards } from '../components/governance/OverviewCards'
import { PoolOutcomes } from '../components/governance/PoolOutcomes'
import { ProposalCard } from '../components/governance/ProposalCard'
import { TrendChart } from '../components/governance/TrendChart'
import { Chip, EmptyState, Loading, PageHeader } from '../components/ui'
import { useGovernanceStats, usePoolSummaries, useRecentVotes } from '../hooks/data'

type Sort = 'divisiveness' | 'stake' | 'participation' | 'recency'
const stakeOf = (s: { yes: number, no: number, abstain: number }): number => s.yes + s.no + s.abstain

export function GovernancePage (): ReactNode {
  const { data: stats, isLoading, error } = useGovernanceStats()
  const recent = useRecentVotes(100)
  const { data: summaries } = usePoolSummaries()
  const [sort, setSort] = useState<Sort>('divisiveness')
  const poolNames = useMemo(() => new Map((summaries ?? []).map(s => [s.pool.id, s.pool.name])), [summaries])
  // The leaderboard holds exactly the hosted pools whose node can still vote, so the log matches the rest of the page
  const votableIds = useMemo(() => new Set((stats?.leaderboard ?? []).map(r => r.pool.id)), [stats])
  const recentVotes = useMemo(() => (recent.data ?? []).filter(v => votableIds.has(v.poolId)), [recent.data, votableIds])

  const proposals = useMemo(() => {
    const list = [...(stats?.proposals ?? [])]
    switch (sort) {
      case 'stake': return list.sort((a, b) => stakeOf(b.stake) - stakeOf(a.stake))
      case 'participation': return list.sort((a, b) => b.participation.poolsVoted - a.participation.poolsVoted)
      case 'recency': return list.sort((a, b) => b.lastActivity - a.lastActivity)
      default: return list.sort((a, b) => a.margin - b.margin)
    }
  }, [stats, sort])

  return (
    <div className='mx-auto max-w-5xl'>
      <PageHeader
        title='Governance'
        subtitle='How pools using the shared voting service lean on Dash governance proposals. Choices are recorded on Platform, not cast on Dash Core.'
      />
      {error != null && <EmptyState title='Could not load governance stats'>{String(error)}</EmptyState>}
      {isLoading && <Loading />}
      {stats != null && (
        <div className='flex flex-col gap-6'>
          <OverviewCards overview={stats.overview} />
          <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
            <TrendChart trend={stats.trend} />
            <Leaderboard rows={stats.leaderboard} />
          </div>
          <PoolOutcomes pools={stats.leaderboard.map(r => r.pool)} proposals={proposals} />
          <div className='flex flex-col gap-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-small font-bold'>Proposals</span>
              <Chip active={sort === 'divisiveness'} onClick={() => setSort('divisiveness')}>Most contested</Chip>
              <Chip active={sort === 'stake'} onClick={() => setSort('stake')}>Most stake</Chip>
              <Chip active={sort === 'participation'} onClick={() => setSort('participation')}>Most participation</Chip>
              <Chip active={sort === 'recency'} onClick={() => setSort('recency')}>Recent</Chip>
            </div>
            {proposals.length === 0
              ? <EmptyState title='No proposals yet'>Proposals appear here once pool members record choices.</EmptyState>
              : proposals.map(p => <ProposalCard key={p.proposalHash} stats={p} />)}
          </div>
          <ChoiceLog votes={recentVotes} loading={recent.isLoading} error={recent.error} poolNames={poolNames} />
        </div>
      )}
    </div>
  )
}