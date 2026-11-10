import { Tabs } from 'dash-ui-kit/react'
import type { ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { IdentityChip, StatusBadge } from '../components/bits'
import { Chat } from '../components/Chat'
import { ActionPanel } from '../components/pool/ActionPanel'
import { ActivityTab } from '../components/pool/ActivityTab'
import { FeedbackTab } from '../components/pool/FeedbackTab'
import { MembersTab } from '../components/pool/MembersTab'
import { OverviewTab } from '../components/pool/OverviewTab'
import { PrivateChat } from '../components/pool/PrivateChat'
import { poolRole } from '../components/pool/role'
import { SystemTab } from '../components/pool/SystemTab'
import { Card, EmptyState, Loading } from '../components/ui'
import { usePoolState } from '../hooks/data'
import { relativeTime } from '../lib/format'
import { useWallet } from '../wallet/WalletContext'

const TABS = ['overview', 'members', 'activity', 'chat', 'private', 'feedback', 'system'] as const
type Tab = typeof TABS[number]

export function PoolPage (): ReactNode {
  const { poolId = '' } = useParams()
  const { data: state, isLoading, error } = usePoolState(poolId)
  const { activeIdentity } = useWallet()
  const [params, setParams] = useSearchParams()
  const myMember = state == null ? null : poolRole(state, activeIdentity).myMember
  const requested: Tab = TABS.includes(params.get('tab') as Tab) ? params.get('tab') as Tab : 'overview'
  // The System tab only exists for share owners: a stale or hand-typed link falls back to Overview
  const tab: Tab = requested === 'system' && myMember == null ? 'overview' : requested
  const setTab = (value: string): void => setParams(p => { p.set('tab', value); return p }, { replace: true })

  if (isLoading) return <Loading label='Loading pool…' />
  if (error != null) return <EmptyState title='Could not load this pool'>{String(error)}</EmptyState>
  if (state == null) {
    return (
      <EmptyState title='Pool not found' action={<Link to='/pools' className='font-bold text-brand-ink'>Back to pools</Link>}>
        No pool document has this ID.
      </EmptyState>
    )
  }

  const { pool } = state
  return (
    <div>
      <Link to='/pools' className='text-small font-semibold text-muted hover:text-fg'>← All pools</Link>

      <header className='mt-4 mb-8 flex flex-col gap-4'>
        <div className='flex flex-wrap items-center gap-3'>
          <h1 className='text-title'>{pool.name}</h1>
          <StatusBadge status={state.status} />
        </div>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted'>
          <span className='inline-flex items-center gap-2'>by <IdentityChip id={pool.ownerId} size='sm' link /></span>
          <span aria-hidden>·</span>
          <span>created {relativeTime(pool.createdAt)}</span>
        </div>
        {pool.description !== '' && <p className='max-w-2xl text-muted'>{pool.description}</p>}
      </header>

      <div className='grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]'>
        <aside className='lg:sticky lg:top-24 lg:order-2'>
          <ActionPanel state={state} onShowMembers={() => setTab('members')} />
        </aside>

        <Card className='lg:order-1'>
          <Tabs
            value={tab}
            onValueChange={setTab}
            size='sm'
            listClassName='overflow-x-auto'
            contentClassName='pt-6'
            items={[
              { value: 'overview', label: 'Overview', content: <OverviewTab state={state} /> },
              { value: 'members', label: `Members · ${state.lock == null ? state.joins.length : state.members.length}`, content: <MembersTab state={state} /> },
              { value: 'activity', label: 'Activity', content: <ActivityTab state={state} /> },
              { value: 'chat', label: 'Chat', content: <Chat channel={pool.id} highlight={[pool.ownerId]} /> },
              { value: 'private', label: 'Private chat', content: <PrivateChat state={state} /> },
              { value: 'feedback', label: 'Feedback', content: <FeedbackTab state={state} /> },
              ...(myMember == null ? [] : [{ value: 'system', label: 'System', content: <SystemTab state={state} member={myMember} /> }])
            ]}
          />
        </Card>
      </div>
    </div>
  )
}
