import { Tabs } from 'dash-ui-kit/react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { IdentityChip, StatusBadge } from '../components/bits'
import { Chat } from '../components/Chat'
import { ActionPanel, JoinProgress } from '../components/pool/ActionPanel'
import { poolEvents, voteEvents } from '../components/pool/activity'
import { AvatarUpload } from '../components/pool/AvatarUpload'
import { DetailsTab } from '../components/pool/DetailsTab'
import { FeedbackTab } from '../components/pool/FeedbackTab'
import { GovernanceTab } from '../components/pool/GovernanceTab'
import { MembersTab } from '../components/pool/MembersTab'
import { PoolAvatar } from '../components/PoolAvatar'
import { PrivateChat } from '../components/pool/PrivateChat'
import { hasSigningTask, poolRole } from '../components/pool/role'
import { SystemTab } from '../components/pool/SystemTab'
import { Card, EmptyState, Loading } from '../components/ui'
import { backend } from '../data'
import { usePoolDocument, usePoolPreview, usePoolState, useVotes } from '../hooks/data'
import { setMockAvatar, useMockAvatar } from '../hooks/useMockAvatar'
import { HOSTING_VOTING_ADDRESS } from '../hosting'
import { relativeTime } from '../lib/format'
import { useWallet } from '../wallet/WalletContext'

const TABS = ['activity', 'details', 'members', 'private', 'feedback', 'governance', 'system'] as const
type Tab = typeof TABS[number]

export function PoolPage (): ReactNode {
  const { poolId = '' } = useParams()
  const preview = usePoolPreview(poolId)
  const { data: document } = usePoolDocument(poolId)
  const { data, error } = usePoolState(poolId)
  const state = data ?? null
  const { activeIdentity } = useWallet()
  const poolForGate = state?.pool ?? document ?? preview?.pool ?? null
  const hosted = poolForGate?.votingAddress === HOSTING_VOTING_ADDRESS
  const votes = useVotes(poolId, hosted)
  const mockAvatar = useMockAvatar(poolId)
  const [params, setParams] = useSearchParams()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const role = state == null ? null : poolRole(state, activeIdentity)
  const myMember = role?.myMember ?? null
  const signingFocus = state != null && role != null && hasSigningTask(state, role)
  const requested = params.get('tab') === 'overview' ? 'details' : params.get('tab')
  const requestedTab: Tab = TABS.includes(requested as Tab) ? requested as Tab : 'activity'
  // The System tab only exists for share owners; Governance for registered pools (the tab itself
  // splits on the voting address). A stale or hand-typed link to either falls back to Activity.
  const governance = state != null && state.lock != null && (state.status === 'REGISTERED' || state.status === 'FORMED')
  const tab: Tab = (requestedTab === 'system' && myMember == null) || (requestedTab === 'governance' && !governance) ? 'activity' : requestedTab
  const setTab = (value: string): void => setParams(p => { p.set('tab', value); return p }, { replace: true })

  useEffect(() => { setDetailsOpen(false) }, [poolId])

  // Error and not-found come before any preview rendering, so a stale preview never masks them.
  // data === null means settled-and-absent; undefined means still loading.
  if (error != null) return <EmptyState title='Could not load this pool'>{String(error)}</EmptyState>
  if (data === null) {
    return (
      <EmptyState title='Pool not found' action={<Link to='/pools' className='font-bold text-brand-ink'>Back to pools</Link>}>
        No pool document has this ID.
      </EmptyState>
    )
  }

  const pool = state?.pool ?? document ?? preview?.pool ?? null
  if (pool == null) return <Loading label='Loading pool…' />

  // Only the pool creator may change the avatar; uploads live in the sandbox until the avatar document ships
  const canEditAvatar = backend.mode === 'mock' && activeIdentity != null && pool.ownerId === activeIdentity

  const badgeStatus = state?.status ?? preview?.listStatus
  const memberCount = state != null ? (state.lock == null ? state.joins.length : state.members.length) : preview?.joinCount ?? '…'
  const details = (
    <Card>
      <Tabs
        value={tab}
        onValueChange={setTab}
        size='sm'
        listClassName='overflow-x-auto'
        contentClassName='pt-6'
        items={[
          { value: 'activity', label: 'Activity', content: <Chat channel={pool.id} events={state != null ? [...poolEvents(state), ...(hosted ? voteEvents(votes.data ?? [], state.members.map(m => m.join)) : [])] : []} highlight={[pool.ownerId]} /> },
          { value: 'details', label: 'Details', content: state != null ? <DetailsTab state={state} /> : <Loading /> },
          { value: 'members', label: `Members · ${memberCount}`, content: state != null ? <MembersTab state={state} /> : <Loading /> },
          { value: 'private', label: 'Private chat', content: state != null ? <PrivateChat state={state} /> : <Loading /> },
          { value: 'feedback', label: 'Feedback', content: state != null ? <FeedbackTab state={state} /> : <Loading /> },
          ...(governance && state != null ? [{ value: 'governance', label: 'Governance', content: <GovernanceTab state={state} /> }] : []),
          ...(myMember != null && state != null ? [{ value: 'system', label: 'System', content: <SystemTab state={state} member={myMember} /> }] : [])
        ]}
      />
    </Card>
  )
  const actions = state != null
    ? <ActionPanel state={state} onShowMembers={() => setTab('members')} />
    : (
      <Card>
        {preview != null && preview.lock == null
          ? <JoinProgress total={preview.joinedTotal} />
          : <Loading label='Loading actions…' />}
      </Card>
      )

  return (
    <div>
      <Link to='/pools' className='text-small font-semibold text-muted hover:text-fg'>← All pools</Link>

      <header className='mt-4 mb-8 flex flex-col gap-4'>
        <div className='flex flex-wrap items-center gap-3'>
          {canEditAvatar
            ? (
              <AvatarUpload
                poolId={pool.id}
                name={pool.name}
                src={mockAvatar}
                onSet={url => setMockAvatar(pool.id, url)}
                onRemove={() => setMockAvatar(pool.id, null)}
              />
              )
            : <PoolAvatar poolId={pool.id} name={pool.name} src={backend.mode === 'mock' ? mockAvatar : undefined} size='md' />}
          <h1 className='text-title'>{pool.name}</h1>
          {badgeStatus != null && <StatusBadge status={badgeStatus} />}
        </div>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted'>
          <span className='inline-flex items-center gap-2'>by <IdentityChip id={pool.ownerId} size='sm' link /></span>
          <span aria-hidden>·</span>
          <span>created {relativeTime(pool.createdAt)}</span>
        </div>
        {pool.description !== '' && <p className='max-w-2xl text-muted'>{pool.description}</p>}
      </header>

      {signingFocus
        ? (
          <div className='flex flex-col gap-6'>
            {actions}
            {detailsOpen
              ? details
              : (
                <div className='flex justify-center'>
                  <button
                    type='button'
                    className='text-small font-bold text-brand-ink hover:underline'
                    onClick={() => { setTab('details'); setDetailsOpen(true) }}
                  >
                    View pool details
                  </button>
                </div>
                )}
          </div>
          )
        : (
          <div className='grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]'>
            <aside className='lg:sticky lg:top-24 lg:order-2'>{actions}</aside>
            <div className='lg:order-1'>{details}</div>
          </div>
          )}
    </div>
  )
}
