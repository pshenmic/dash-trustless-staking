import { Tabs } from 'dash-ui-kit/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { IdentityChip, StatusBadge } from '../components/bits'
import { Button } from '../components/Button'
import { Chat } from '../components/Chat'
import { ActionPanel, JoinProgress } from '../components/pool/ActionPanel'
import { poolEvents, voteEvents } from '../components/pool/activity'
import { DetailsTab } from '../components/pool/DetailsTab'
import { EditPoolDetails } from '../components/pool/EditPoolDetails'
import { FeedbackTab } from '../components/pool/FeedbackTab'
import { GovernanceTab } from '../components/pool/GovernanceTab'
import { MembersTab } from '../components/pool/MembersTab'
import { hasSigningTask, poolRole } from '../components/pool/role'
import { SinceLastVisit } from '../components/pool/SinceLastVisit'
import { SystemTab } from '../components/pool/SystemTab'
import { GenerationBanner } from '../components/GenerationBanner'
import { Card, EmptyState, Loading, Notice } from '../components/ui'
import { useGeneration } from '../generations'
import { usePoolDocument, usePoolMetas, usePoolPreview, usePoolState, useVotes } from '../hooks/data'
import { useSeen } from '../hooks/useSeen'
import { HOSTING_VOTING_ADDRESS } from '../hosting'
import { relativeTime } from '../lib/format'
import { latestCreatorMeta, poolDisplayDescription, poolDisplayName } from '../lib/poolName'
import { changesSince, type PoolChanges } from '../lib/seen'
import { useWallet } from '../wallet/WalletContext'

const TABS = ['activity', 'details', 'members', 'feedback', 'governance', 'system'] as const
type Tab = typeof TABS[number]

export function PoolPage (): ReactNode {
  const { poolId = '' } = useParams()
  const preview = usePoolPreview(poolId)
  const { base, ref } = useGeneration()
  const { data: document } = usePoolDocument(poolId)
  const { data, error } = usePoolState(poolId)
  const state = data ?? null
  const { activeIdentity } = useWallet()
  const poolForGate = state?.pool ?? document ?? preview?.pool ?? null
  const hosted = poolForGate?.votingAddress === HOSTING_VOTING_ADDRESS
  const votes = useVotes(poolId, hosted)
  const metas = usePoolMetas(poolId)
  const { lastSeen, markSeen } = useSeen(poolId)
  const [params, setParams] = useSearchParams()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [editDetailsOpen, setEditDetailsOpen] = useState(false)
  const role = state == null ? null : poolRole(state, activeIdentity)
  const myMember = role?.myMember ?? null
  const signingFocus = state != null && role != null && hasSigningTask(state, role)
  const memberTotal = state == null ? 0 : (state.lock == null ? state.joins.length : state.members.length)
  // Freeze the diff at arrival: a signature that lands while the page is open is visible live in the
  // feed and the status badge, and must not make a "since your last visit" banner appear 20 s later.
  const arrival = useRef<{ poolId: string, changes: PoolChanges | null | undefined }>({ poolId, changes: undefined })
  if (arrival.current.poolId !== poolId) arrival.current = { poolId, changes: undefined }
  if (state != null && arrival.current.changes === undefined) {
    arrival.current.changes = changesSince(lastSeen, { status: state.status, consents: state.consentCount, fundings: state.fundingCount, members: memberTotal })
  }
  const changes = arrival.current.changes ?? null
  // Keep "last seen" at the state currently on screen; the diff above is computed against the mount value
  useEffect(() => {
    if (state == null) return
    markSeen({ status: state.status, consents: state.consentCount, fundings: state.fundingCount, members: memberTotal })
  }, [markSeen, state, memberTotal])
  const requested = params.get('tab') === 'overview' ? 'details' : params.get('tab')
  const requestedTab: Tab = TABS.includes(requested as Tab) ? requested as Tab : 'activity'
  // The System tab only exists for share owners; Governance for any locked pool — choices are Platform
  // documents, so members can record them while the registration is still waiting for a block. The tab
  // itself splits on the voting address. A stale or hand-typed link to either falls back to Activity.
  const governance = state != null && state.lock != null
  const tab: Tab = (requestedTab === 'system' && myMember == null) || (requestedTab === 'governance' && !governance) ? 'activity' : requestedTab
  const setTab = (value: string): void => setParams(p => { p.set('tab', value); return p }, { replace: true })

  useEffect(() => { setDetailsOpen(false); setEditDetailsOpen(false) }, [poolId])

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

  const creatorMeta = latestCreatorMeta(metas.data ?? [], pool.ownerId)
  const isCreator = role?.isCreator === true
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
          { value: 'activity', label: 'Activity', content: <Chat channel={pool.id} since={lastSeen?.at} events={state != null ? [...poolEvents(state, metas.data ?? []), ...(hosted ? voteEvents(votes.data ?? [], state.members.map(m => m.join)) : [])] : []} highlight={[pool.ownerId]} /> },
          { value: 'details', label: 'Details', content: state != null ? <DetailsTab state={state} /> : <Loading /> },
          { value: 'members', label: `Members · ${memberCount}`, content: state != null ? <MembersTab state={state} /> : <Loading /> },
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
      <Link to={`${base}/pools`} className='text-small font-semibold text-muted hover:text-fg'>← All pools</Link>

      <div className='mb-6'>
        <GenerationBanner poolId={pool.id} />
      </div>

      <header className='mt-4 mb-8 flex flex-col gap-4'>
        <div className='flex flex-wrap items-center gap-3'>
          <h1 className='text-title'>{poolDisplayName(pool, creatorMeta)}</h1>
          {badgeStatus != null && <StatusBadge status={badgeStatus} />}
          {state != null && isCreator && ref.canWrite && (
            <Button size='sm' onClick={() => setEditDetailsOpen(true)}>Edit details</Button>
          )}
        </div>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted'>
          <span className='inline-flex items-center gap-2'>by <IdentityChip id={pool.ownerId} size='sm' link /></span>
          <span aria-hidden>·</span>
          <span>created {relativeTime(pool.createdAt)}</span>
        </div>
        {poolDisplayDescription(pool, creatorMeta) !== '' && <p className='max-w-2xl text-muted'>{poolDisplayDescription(pool, creatorMeta)}</p>}
      </header>

      {state != null && (
        <EditPoolDetails state={state} metas={metas.data ?? []} open={editDetailsOpen} onOpenChange={setEditDetailsOpen} />
      )}

      {creatorMeta?.archived === true && (
        <Notice tone='info' title='Archived by the creator'>
          This pool has been retired. Nothing was deleted — the terms, members and any registration still hold —
          it is just no longer promoted on the pools grid.
        </Notice>
      )}

      {changes != null && <SinceLastVisit changes={changes} />}

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
