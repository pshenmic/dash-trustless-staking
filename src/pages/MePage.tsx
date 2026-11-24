import { Tabs } from 'dash-ui-kit/react'
import { Button } from '../components/Button'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Dash, IdentityChip, StatusBadge } from '../components/bits'
import { Card, EmptyState, IdentifierValue, Loading, Notice, PageHeader, SectionTitle, Stars } from '../components/ui'
import { errorMessage } from '../components/Toast'
import type { ActionKind, PoolState } from '../data/queries'
import { generationPath } from '../generations'
import { useMyActivity, type MyDashboard } from '../hooks/data'
import { relativeTime, shortId } from '../lib/format'
import { rewardSharePercent } from '../lib/rules'
import type { VoteOutcome } from '../lib/types'
import { outcomeLabel } from '../lib/voting'
import { useWallet } from '../wallet/WalletContext'

const ACTION_TEXT: Record<ActionKind, { title: string, cta: string, tab: string }> = {
  consent: { title: 'Sign your consent', cta: 'Sign', tab: 'details' },
  funding: { title: 'Sign your coins', cta: 'Sign', tab: 'details' },
  lock: { title: 'Enough shares: select members and lock', cta: 'Select members', tab: 'members' },
  broadcast: { title: 'All signatures in: broadcast the registration', cta: 'Broadcast', tab: 'details' }
}

/** The identity's own material, one tab each — a new "mine" list becomes a tab, not another section */
const MINE_TABS = ['shares', 'pools', 'reviews', 'votes'] as const
type MineTab = typeof MINE_TABS[number]

export function MePage (): ReactNode {
  const { activeIdentity, openLogin } = useWallet()
  const { data, isLoading, error } = useMyActivity(activeIdentity)
  const [params, setParams] = useSearchParams()

  if (activeIdentity == null) {
    return (
      <div>
        <PageHeader title='Profile' />
        <EmptyState
          title='Log in with your identity keys'
          action={<Button colorScheme='brand' size='md' onClick={openLogin}>Log in</Button>}
        >
          Your identity, your shares and anything waiting for your signature show up here.
        </EmptyState>
      </div>
    )
  }

  const requested = params.get('tab')
  const setTab = (value: string): void => setParams(p => { p.set('tab', value); return p }, { replace: true })

  return (
    <div className='flex flex-col gap-10'>
      <PageHeader title='Profile' subtitle='Your identity, the pools you created or hold a share in, and anything waiting on you.' />
      <ProfileCard identity={activeIdentity} />
      {error != null
        ? <Notice tone='error' title='Could not load your dashboard'>{errorMessage(error)}</Notice>
        : isLoading || data == null
          ? <Loading />
          : <MineTabs data={data} requested={requested} onTabChange={setTab} />}
    </div>
  )
}

function MineTabs ({ data, requested, onTabChange }: { data: MyDashboard, requested: string | null, onTabChange: (value: string) => void }): ReactNode {
  // Open on the tab that has something in it; a stale or hand-typed value falls back to that
  const fallback: MineTab = data.joined.length > 0 ? 'shares' : data.created.length > 0 ? 'pools' : 'shares'
  const tab: MineTab = MINE_TABS.includes(requested as MineTab) ? requested as MineTab : fallback

  return (
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
                  <Link to={`${generationPath(a.generation, a.pool.id)}?tab=${ACTION_TEXT[a.kind].tab}`}><Button colorScheme='mint' size='sm' className='font-bold'>{ACTION_TEXT[a.kind].cta}</Button></Link>
                </li>
              ))}
            </ul>
            )}
      </section>

      <Tabs
        value={tab}
        onValueChange={onTabChange}
        size='sm'
        listClassName='overflow-x-auto'
        contentClassName='pt-6'
        items={[
          { value: 'shares', label: `Shares · ${data.joined.length}`, content: <SharesTab data={data} /> },
          { value: 'pools', label: `Pools · ${data.created.length}`, content: <PoolsTab data={data} /> },
          { value: 'reviews', label: `Reviews · ${data.reviews.length}`, content: <ReviewsTab data={data} /> },
          { value: 'votes', label: `Votes · ${data.votes.length}`, content: <VotesTab data={data} /> }
        ]}
      />
    </>
  )
}

function SharesTab ({ data }: { data: MyDashboard }): ReactNode {
  if (data.joined.length === 0) {
    return <EmptyState title='You don’t hold a share in any pool' action={<Link to='/pools'><Button colorScheme='lightBlue' size='sm'>Browse pools</Button></Link>} />
  }
  return (
    <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
      {data.joined.map(({ state, join, selected, generation }) => (
        <PoolRow
          key={join.id}
          state={state}
          generation={generation}
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
  )
}

function PoolsTab ({ data }: { data: MyDashboard }): ReactNode {
  if (data.created.length === 0) {
    return <EmptyState title='You haven’t created a pool' action={<Link to='/pools/new'><Button colorScheme='brand' size='sm'>Create a pool</Button></Link>} />
  }
  return (
    <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
      {data.created.map(({ state, generation }) => (
        <PoolRow
          key={state.pool.id}
          state={state}
          generation={generation}
          detail={state.lock == null
            ? `${state.joins.length} share${state.joins.length === 1 ? '' : 's'}`
            : `${state.members.length} members`}
        />
      ))}
    </div>
  )
}

function ReviewsTab ({ data }: { data: MyDashboard }): ReactNode {
  if (data.reviews.length === 0) {
    return <p className='text-small text-muted'>You haven’t reviewed a pool yet. Open a running pool and leave one from its Feedback tab.</p>
  }
  return (
    <ul className='flex flex-col gap-2'>
      {data.reviews.map(({ feedback, pool, generation }) => (
        <li key={feedback.id}>
          <Link
            to={`${generationPath(generation, feedback.poolId)}?tab=feedback`}
            className='block rounded-2xl border border-line/70 px-4 py-3 transition-colors hover:border-brand/50'
          >
            <div className='flex items-center justify-between gap-3'>
              <div className='truncate font-bold'>{pool?.name ?? shortId(feedback.poolId)}</div>
              <Stars value={feedback.rating} size={14} />
            </div>
            {feedback.text !== '' && <p className='mt-1 line-clamp-2 text-small text-muted'>{feedback.text}</p>}
            <p className='mt-1 text-tag text-muted'>{relativeTime(feedback.createdAt)}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function VotesTab ({ data }: { data: MyDashboard }): ReactNode {
  if (data.votes.length === 0) {
    return (
      <p className='text-small text-muted'>
        You haven’t voted on a proposal yet. <Link to='/governance' className='font-bold text-brand-ink hover:underline'>See the proposals</Link>
      </p>
    )
  }
  return (
    <ul className='flex flex-col gap-2'>
      {data.votes.map(({ vote, pool, generation }) => (
        <li key={vote.id}>
          <Link
            to={`${generationPath(generation, vote.poolId)}?tab=governance`}
            className='flex items-center justify-between gap-3 rounded-2xl border border-line/70 px-4 py-3 transition-colors hover:border-brand/50'
          >
            <div className='min-w-0'>
              <div className='truncate font-bold'>{pool?.name ?? shortId(vote.poolId)}</div>
              <div className='mt-0.5 text-tag text-muted'>
                Proposal {vote.proposalHash.slice(0, 8)}… · {relativeTime(vote.createdAt)}
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-tag font-semibold ${OUTCOME_STYLE[vote.outcome]}`}>
              {outcomeLabel(vote.outcome)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

const OUTCOME_STYLE: Record<VoteOutcome, string> = {
  1: 'bg-mint-soft text-mint-ink',
  2: 'bg-red-soft text-red-ink',
  3: 'bg-surface-2 text-muted'
}

/**
 * The identity block that used to be the header menu: switch identity, settings, log out. The full id
 * is shown with the app's copy affordance, because a truncated one cannot be matched anywhere.
 */
function ProfileCard ({ identity }: { identity: string }): ReactNode {
  const { identities, selectIdentity, logout } = useWallet()
  const others = identities.filter(id => id !== identity)

  return (
    <Card>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div className='flex min-w-0 flex-col gap-2'>
          <IdentityChip id={identity} />
          <IdentifierValue value={identity} label='identity ID' />
        </div>
        <div className='flex flex-wrap gap-2'>
          <Link to='/settings'><Button size='sm'>Settings</Button></Link>
          <Button size='sm' colorScheme='lightBlue' onClick={logout}>Log out</Button>
        </div>
      </div>
      {others.length > 0 && (
        <div className='mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-4'>
          <span className='text-tag text-muted'>Switch identity</span>
          {others.map(id => (
            <Button key={id} size='sm' onClick={() => selectIdentity(id)}>Use {shortId(id, 6)}</Button>
          ))}
        </div>
      )}
    </Card>
  )
}

function PoolRow ({ state, generation, detail }: { state: PoolState, generation: string, detail: ReactNode }): ReactNode {
  return (
    <Link to={generationPath(generation, state.pool.id)} className='block'>
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