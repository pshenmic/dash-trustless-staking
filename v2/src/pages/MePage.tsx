import { Button } from '../components/Button'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Dash, StatusBadge } from '../components/bits'
import { Card, EmptyState, Loading, PageHeader, SectionTitle } from '../components/ui'
import type { ActionKind, PoolState } from '../data/queries'
import { useMyActivity } from '../hooks/data'
import { rewardSharePercent } from '../lib/rules'
import { useWallet } from '../wallet/WalletContext'

const ACTION_TEXT: Record<ActionKind, { title: string, cta: string, tab: string }> = {
  consent: { title: 'Sign your consent', cta: 'Sign', tab: 'overview' },
  funding: { title: 'Sign your coins', cta: 'Sign', tab: 'overview' },
  lock: { title: 'Enough joins: select members and lock', cta: 'Select members', tab: 'members' },
  broadcast: { title: 'All signatures in: broadcast the registration', cta: 'Broadcast', tab: 'overview' }
}

export function MePage (): ReactNode {
  const { activeIdentity, status, connect } = useWallet()
  const { data, isLoading } = useMyActivity(activeIdentity)

  if (activeIdentity == null) {
    return (
      <div>
        <PageHeader title='My dashboard' />
        <EmptyState
          title='Connect your identity'
          action={status === 'unavailable'
            ? <Link to='/guide#extension'><Button colorScheme='brand' size='md'>Get Dash Platform Extension</Button></Link>
            : <Button colorScheme='brand' size='md' onClick={() => { void connect() }}>Connect</Button>}
        >
          Your pools, your shares and anything waiting for your signature show up here.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-10'>
      <PageHeader title='My dashboard' subtitle='Pools you created or joined, and anything waiting on you.' />
      {isLoading || data == null
        ? <Loading />
        : (
          <>
            <section>
              <SectionTitle>Action required</SectionTitle>
              {data.actions.length === 0
                ? <p className='text-small text-muted'>Nothing needs you right now.</p>
                : (
                  <ul className='flex flex-col gap-3'>
                    {data.actions.map(a => (
                      <li key={`${a.kind}:${a.pool.id}`} className='flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-brand p-5 text-white'>
                        <div>
                          <div className='font-extrabold'>{ACTION_TEXT[a.kind].title}</div>
                          <div className='text-small text-white/80'>{a.pool.name}</div>
                        </div>
                        <Link to={`/pools/${a.pool.id}?tab=${ACTION_TEXT[a.kind].tab}`}><Button colorScheme='mint' size='sm' className='font-bold'>{ACTION_TEXT[a.kind].cta}</Button></Link>
                      </li>
                    ))}
                  </ul>
                  )}
            </section>

            <section>
              <SectionTitle>My shares</SectionTitle>
              {data.joined.length === 0
                ? <EmptyState title='You haven’t joined a pool' action={<Link to='/pools'><Button colorScheme='lightBlue' size='sm'>Browse pools</Button></Link>} />
                : (
                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                    {data.joined.map(({ state, join, selected }) => (
                      <PoolRow
                        key={join.id}
                        state={state}
                        detail={
                          <>
                            <Dash duffs={join.amount} className='font-bold text-fg' />
                            {' · '}
                            {state.lock == null
                              ? 'waiting for the lock'
                              : selected ? `${rewardSharePercent(join.amount, state.pool.operatorReward).toFixed(2)}% of rewards` : 'not selected'}
                          </>
                        }
                      />
                    ))}
                  </div>
                  )}
            </section>

            <section>
              <SectionTitle aside={<Link to='/pools/new' className='text-small font-bold text-brand-ink hover:underline'>Create a pool</Link>}>My pools</SectionTitle>
              {data.created.length === 0
                ? <p className='text-small text-muted'>You haven’t created a pool.</p>
                : (
                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                    {data.created.map(state => (
                      <PoolRow
                        key={state.pool.id}
                        state={state}
                        detail={state.lock == null
                          ? `${state.joins.length} join${state.joins.length === 1 ? '' : 's'}`
                          : `${state.members.length} members`}
                      />
                    ))}
                  </div>
                  )}
            </section>
          </>
          )}
    </div>
  )
}

function PoolRow ({ state, detail }: { state: PoolState, detail: ReactNode }): ReactNode {
  return (
    <Link to={`/pools/${state.pool.id}`} className='block'>
      <Card className='transition-colors hover:border-brand/50'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='truncate font-extrabold'>{state.pool.name}</div>
            <div className='mt-1 text-small text-muted'>{detail}</div>
          </div>
          <StatusBadge status={state.status} size='sm' />
        </div>
      </Card>
    </Link>
  )
}
