import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { IdentityChip, StatusBadge, Dash, FillBar } from '../components/bits'
import { JoinDialog } from '../components/JoinDialog'
import { PillTabs, type PillTab } from '../components/PillTabs'
import { PoolTile } from '../components/PoolTile'
import { Sheet } from '../components/Sheet'
import { ActionBar } from '../components/pool/ActionBar'
import { ActionView } from '../components/pool/ActionView'
import { ActivityTab } from '../components/pool/ActivityTab'
import { FeedbackTab } from '../components/pool/FeedbackTab'
import { MembersTab } from '../components/pool/MembersTab'
import { OverviewTab } from '../components/pool/OverviewTab'
import { PoolChat, PoolComposer } from '../components/pool/PoolChat'
import { PrivateChat } from '../components/pool/PrivateChat'
import { SheetNotices } from '../components/pool/SheetNotices'
import { SystemTab } from '../components/pool/SystemTab'
import { poolRole } from '../components/pool/role'
import { EmptyState, IdentifierValue, Loading, cn } from '../components/ui'
import type { PoolState } from '../data/queries'
import { useMessages, usePoolState } from '../hooks/data'
import { relativeTime } from '../lib/format'
import { actionBarState, type ActionBarAction } from '../lib/actionBar'
import { earlyExitLabel, operatorLabel } from '../lib/presentation'
import { useWallet } from '../wallet/WalletContext'

const DASHSCAN = 'https://testnet.dashscan.io/transactions'

export function PoolSheet (): ReactNode {
  const { poolId = '' } = useParams()
  const navigate = useNavigate()
  const { activeIdentity, openLogin } = useWallet()
  const { data: state, isLoading, error } = usePoolState(poolId)
  const { data: messages } = useMessages(poolId)
  const [params, setParams] = useSearchParams()
  const viewParam = params.get('view')
  const [view, setViewState] = useState<'sign' | 'broadcast' | null>(viewParam === 'sign' || viewParam === 'broadcast' ? viewParam : null)
  const [joinOpen, setJoinOpen] = useState(false)

  const setView = (next: 'sign' | 'broadcast' | null): void => {
    setViewState(next)
    setParams(previous => {
      if (next == null) previous.delete('view')
      else previous.set('view', next)
      return previous
    }, { replace: true })
  }

  const role = state == null ? null : poolRole(state, activeIdentity)
  const myMember = role?.myMember ?? null

  const close = (): void => {
    // Deep links have no history to go back to; a sheet opened from the grid returns to it
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/pools')
  }

  const setTab = (value: string): void => {
    setParams(previous => { previous.set('tab', value); return previous }, { replace: true })
  }

  const handleAction = (action: ActionBarAction): void => {
    switch (action.kind) {
      case 'login': openLogin(); break
      case 'join': setJoinOpen(true); break
      case 'lock': setTab('members'); break
      case 'consent':
      case 'funding':
      case 'fee': setView('sign'); break
      case 'broadcast': setView('broadcast'); break
    }
  }

  const shareCount = state == null ? 0 : state.lock == null ? state.joins.length : state.members.length
  const joinedTotal = state == null
    ? 0
    : state.lock == null
      ? state.joins.reduce((sum, join) => sum + join.amount, 0)
      : state.members.reduce((sum, member) => sum + member.join.amount, 0)

  const tabs: PillTab[] = state == null
    ? []
    : [
        { value: 'chat', label: 'Chat', count: messages?.length },
        { value: 'members', label: 'Members', count: shareCount },
        { value: 'activity', label: 'Activity' },
        { value: 'feedback', label: 'Feedback' },
        { value: 'details', label: 'Details' },
        ...(state.lock != null && myMember != null ? [{ value: 'private', label: 'Private chat' }] : []),
        ...(myMember != null ? [{ value: 'system', label: 'System' }] : [])
      ]
  const requested = params.get('tab') ?? 'chat'
  const tab = tabs.some(item => item.value === requested) ? requested : 'chat'

  return (
    <Sheet open onOpenChange={open => { if (!open) close() }} title={state?.pool.name ?? 'Pool'}>
      <div className='relative flex h-[92dvh] flex-col max-md:h-dvh'>
        {state == null && (
          <button
            type='button'
            onClick={close}
            aria-label='Close pool'
            className='absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-full bg-surface-2 text-muted transition-colors hover:text-fg'
          >
            <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' aria-hidden>
              <path d='M6 6l12 12M18 6L6 18' />
            </svg>
          </button>
        )}
        {isLoading && <div className='flex flex-1 items-center justify-center'><Loading label='Loading pool…' /></div>}

        {error != null && (
          <div className='p-6'><EmptyState title='Could not load this pool'>{String(error)}</EmptyState></div>
        )}

        {!isLoading && error == null && state == null && (
          <div className='p-6'>
            <EmptyState title='Pool not found' action={<Link to='/pools' className='font-bold text-brand-ink'>Back to pools</Link>}>
              No pool document has this ID.
            </EmptyState>
          </div>
        )}

        {state != null && role != null && (
          <>
            <PoolHeader state={state} joinedTotal={joinedTotal} shareCount={shareCount} onClose={close} />

            {view == null
              ? (
                <>
                  <div className='shrink-0 px-5 md:px-6'>
                    <SheetNotices state={state} role={role} />
                  </div>
                  <div className='shrink-0 border-b border-line/70 px-5 md:px-6'>
                    <PillTabs tabs={tabs} value={tab} onChange={setTab} />
                  </div>
                  <div className={cn('min-h-0 flex-1 px-5 py-5 md:px-6', tab === 'chat' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto')}>
                    {tab === 'chat' && <PoolChat state={state} />}
                    {tab === 'members' && <MembersTab state={state} />}
                    {tab === 'activity' && <ActivityTab state={state} />}
                    {tab === 'feedback' && <FeedbackTab state={state} />}
                    {tab === 'details' && <OverviewTab state={state} />}
                    {tab === 'private' && myMember != null && <PrivateChat state={state} />}
                    {tab === 'system' && myMember != null && <SystemTab state={state} member={myMember} />}
                  </div>

                  <div className='shrink-0 border-t border-line/70 px-4 pt-3 pb-4 md:px-6'>
                    <ActionBar model={actionBarState(state, role)} onAction={handleAction} />
                    {tab === 'chat' && <div className='mt-3'><PoolComposer state={state} /></div>}
                  </div>
                </>
                )
              : (
                <div className='min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6'>
                  <ActionView state={state} view={view} onBack={() => setView(null)} />
                </div>
                )}

            <JoinDialog pool={state.pool} open={joinOpen} onOpenChange={setJoinOpen} />
          </>
        )}
      </div>
    </Sheet>
  )
}

function PoolHeader ({ state, joinedTotal, shareCount, onClose }: {
  state: PoolState
  joinedTotal: number
  shareCount: number
  onClose: () => void
}): ReactNode {
  const { pool } = state
  const operator = operatorLabel(pool)
  const free = pool.earlyPenalty === 0

  return (
    <header className='shrink-0 border-b border-line/70 px-5 pt-5 pb-4 md:px-6'>
      <div className='flex items-start justify-between gap-4'>
        <div className='flex min-w-0 items-start gap-3'>
          <PoolTile name={pool.name} id={pool.id} size={56} />
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <h2 className='text-[22px] leading-7 font-extrabold tracking-[-0.03em]'>{pool.name}</h2>
              <StatusBadge status={state.status} />
            </div>
            <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted'>
              <IdentityChip id={pool.ownerId} size='sm' link />
              <span aria-hidden>·</span>
              <span>created {relativeTime(pool.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <span className={cn('rounded-full px-2.5 py-1 text-tag font-bold', free ? 'bg-mint-soft text-mint-ink' : 'bg-orange-soft text-orange-ink')}>
            {earlyExitLabel(pool.earlyPenalty)}
          </span>
          <button
            type='button'
            onClick={onClose}
            aria-label='Close pool'
            className='flex size-9 items-center justify-center rounded-full bg-surface-2 text-muted transition-colors hover:text-fg'
          >
            <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' aria-hidden>
              <path d='M6 6l12 12M18 6L6 18' />
            </svg>
          </button>
        </div>
      </div>

      <div className='mt-4'>
        <FillBar joined={joinedTotal} />
        <div className='mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-small'>
          <span className='flex items-baseline gap-1.5'>
            <Dash duffs={joinedTotal} className='text-[18px] font-extrabold' />
            <span className='text-muted'>· {shareCount} {shareCount === 1 ? 'share' : 'shares'}</span>
          </span>
          <span className='flex items-center gap-2 text-muted'>
            1 000 DASH
            <span className='rounded-full bg-brand-soft px-2 py-0.5 text-tag font-bold text-brand-ink'>Masternode</span>
          </span>
        </div>
      </div>

      <dl className='mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-small sm:grid-cols-2'>
        <div className='flex min-w-0 gap-2'>
          <dt className='text-muted'>Operator:</dt>
          <dd className='min-w-0 truncate font-semibold'>{operator.name} · {operator.fee}</dd>
        </div>
        <div className='flex min-w-0 items-center gap-2 sm:col-span-2'>
          <dt className='text-muted'>ProTx:</dt>
          <dd className='min-w-0 flex-1'>
            {state.finalTx == null
              ? <span className='text-muted'>Not registered yet</span>
              : <IdentifierValue value={state.finalTx.txid} href={`${DASHSCAN}/${state.finalTx.txid}`} label='ProTx hash' />}
          </dd>
        </div>
      </dl>
    </header>
  )
}