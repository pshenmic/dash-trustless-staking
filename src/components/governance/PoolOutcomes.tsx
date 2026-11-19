import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { PoolSentiment } from '../../data/queries'
import type { ProposalStats } from '../../lib/governanceStats'
import { formatDash, shortId } from '../../lib/format'
import type { Pool } from '../../lib/types'
import { Card, EmptyState, cn } from '../ui'
import { OUTCOME_CHIP, OUTCOME_LABEL, OUTCOME_LETTER } from './outcome'

/**
 * Proposal × pool heatmap of resolved outcomes. Each cell is `tally()` — the stake-weighted aggregate
 * of the pool's locked members' latest choices — which is exactly the outcome the operator's watcher
 * submits to Core via `voteraw` (signal `funding`). A dash means no counted choice, so nothing is sent.
 * Cells are single-letter chips so a dozen pools still fit; the full pool name, word and stake are in
 * the tooltip.
 */
export function PoolOutcomes ({ pools, proposals }: { pools: Pool[], proposals: ProposalStats[] }): ReactNode {
  const cells = useMemo(() => {
    const byProposal = new Map<string, Map<string, PoolSentiment>>()
    for (const p of proposals) {
      const perPool = new Map<string, PoolSentiment>()
      for (const s of p.pools) perPool.set(s.pool.id, s)
      byProposal.set(p.proposalHash, perPool)
    }
    return byProposal
  }, [proposals])

  return (
    <Card>
      <div className='flex flex-col gap-1'>
        <span className='text-small font-bold'>Pool outcomes</span>
        <p className='text-tag text-muted'>
          What each pool's vote will be: the stake-weighted outcome of its members' latest choices — the value the
          operator's watcher will submit to Core with signal <span className='font-mono'>funding</span> once it runs.
          A dash means the pool has no counted choice, so nothing is sent.
        </p>
        <div className='mt-1 flex flex-wrap items-center gap-3 text-tag text-muted'>
          {([1, 2, 3] as const).map(tally => (
            <span key={tally} className='flex items-center gap-1.5'>
              <span className={cn('inline-flex size-5 items-center justify-center rounded-md text-[10px] font-bold', OUTCOME_CHIP[tally])}>
                {OUTCOME_LETTER[tally]}
              </span>
              {OUTCOME_LABEL[tally].toLowerCase()}
            </span>
          ))}
          <span className='flex items-center gap-1.5'><span className='inline-flex size-5 items-center justify-center text-[10px]'>—</span>no choice</span>
        </div>
      </div>
      {pools.length === 0 || proposals.length === 0
        ? <EmptyState title='No proposals yet'>Pool outcomes appear here once hosted pools record choices.</EmptyState>
        : (
          <div className='mt-3 max-h-96 overflow-auto'>
            {/* Fixed layout: every pool column is the same width whatever the name length. The cap stops
                one or two pools from stretching a cell across the card; the floor keeps a 48px column
                (28px chip + padding) and scrolls instead of squashing chips. */}
            <table
              className='w-full table-fixed border-collapse text-small'
              style={{ minWidth: `${112 + pools.length * 48}px`, maxWidth: `${112 + pools.length * 96}px` }}
            >
              <thead>
                <tr>
                  <th scope='col' className='sticky top-0 left-0 z-30 w-28 bg-surface px-2 py-2 text-left text-tag font-bold text-muted'>Proposal</th>
                  {pools.map(pool => (
                    <th key={pool.id} scope='col' className='sticky top-0 z-20 bg-surface px-1 py-2 text-center align-bottom'>
                      <Link
                        to={`/pools/${pool.id}`}
                        title={pool.name}
                        className='mx-auto line-clamp-2 max-w-[4.75rem] text-tag leading-tight font-bold break-words text-brand-ink hover:underline'
                      >
                        {pool.name}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {proposals.map(p => (
                  <tr key={p.proposalHash} className='border-t border-line/60'>
                    <th scope='row' className='sticky left-0 z-10 whitespace-nowrap bg-surface px-2 py-1 font-mono text-tag font-normal' title={p.proposalHash}>
                      {shortId(p.proposalHash, 6)}
                    </th>
                    {pools.map(pool => {
                      const s = cells.get(p.proposalHash)?.get(pool.id)
                      return (
                        <td key={pool.id} className='px-1 py-1 text-center'>
                          {s?.tally == null
                            ? (
                                <span title={`${pool.name} · no member choice recorded`} className='inline-flex size-7 items-center justify-center text-muted'>
                                  —
                                </span>
                              )
                            : (
                                <span
                                  title={`${pool.name} · ${OUTCOME_LABEL[s.tally]} · ${formatDash(s.votedStake)} of ${formatDash(s.totalStake)} stake voted`}
                                  aria-label={`${pool.name}: ${OUTCOME_LABEL[s.tally]}`}
                                  className={cn('inline-flex size-7 items-center justify-center rounded-lg text-tag font-bold', OUTCOME_CHIP[s.tally])}
                                >
                                  {OUTCOME_LETTER[s.tally]}
                                </span>
                              )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Card>
  )
}