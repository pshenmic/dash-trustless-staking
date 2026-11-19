import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Pool } from '../../lib/types'
import { pluralize } from '../../lib/format'
import { Card, EmptyState } from '../ui'

export function Leaderboard ({ rows }: { rows: Array<{ pool: Pool, voteCount: number, turnout: number }> }): ReactNode {
  const active = rows.filter(r => r.voteCount > 0)
  return (
    <Card>
      <span className='text-small font-bold'>Pool Voting Engagement</span>
      {active.length === 0
        ? <EmptyState title='No votes yet'>Pools rank here once members record choices.</EmptyState>
        : (
          <ul className='mt-3 flex flex-col gap-2'>
            {active.slice(0, 8).map(r => (
              <li key={r.pool.id} className='flex items-center justify-between gap-2 text-small'>
                <Link to={`/pools/${r.pool.id}`} className='font-bold text-brand-ink hover:underline'>{r.pool.name}</Link>
                <span className='whitespace-nowrap text-muted'>{pluralize(r.voteCount, 'choice')} · {Math.round(r.turnout * 100)}% turnout</span>
              </li>
            ))}
          </ul>
        )}
    </Card>
  )
}