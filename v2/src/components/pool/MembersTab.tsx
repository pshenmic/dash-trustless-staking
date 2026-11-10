import { Dialog } from 'dash-ui-kit/react'
import { Button } from '../Button'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { backend } from '../../data'
import { fetchInputValues, type PoolState } from '../../data/queries'
import { useWrite } from '../../hooks/data'
import { COLLATERAL, MAX_SHARES } from '../../lib/consensus'
import { formatDash, relativeTime } from '../../lib/format'
import { rewardSharePercent, selectionProblems } from '../../lib/rules'
import { useSettings } from '../../lib/settings'
import type { Join } from '../../lib/types'
import { useWallet } from '../../wallet/WalletContext'
import { Dash, FillBar, IdentityChip, YouTag } from '../bits'
import { errorMessage, useToast } from '../Toast'
import { cn, EmptyState, Notice } from '../ui'
import { poolRole } from './role'

export function MembersTab ({ state }: { state: PoolState }): ReactNode {
  const { activeIdentity } = useWallet()
  const role = poolRole(state, activeIdentity)

  if (state.lock == null) {
    return role.isCreator ? <LockSelector state={state} /> : <JoinList state={state} />
  }
  return <LockedMembers state={state} />
}

function JoinList ({ state }: { state: PoolState }): ReactNode {
  const { activeIdentity } = useWallet()
  if (state.joins.length === 0) return <EmptyState title='No joins yet'>Be the first to join this pool.</EmptyState>
  return (
    <ul className='divide-y divide-line/70'>
      {state.joins.map(join => (
        <li key={join.id} className='flex items-center justify-between gap-3 py-3'>
          <IdentityChip id={join.ownerId} suffix={join.ownerId === activeIdentity ? <YouTag /> : null} />
          <div className='text-right'>
            <div className='font-bold'><Dash duffs={join.amount} /></div>
            <div className='text-tag text-muted'>joined {relativeTime(join.createdAt)}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Creator view before the lock: pick joins that add up to exactly 1000 DASH, in share order */
function LockSelector ({ state }: { state: PoolState }): ReactNode {
  const { activeIdentity } = useWallet()
  const { settings, toggleBan } = useSettings()
  const { notify } = useToast()
  const [selected, setSelected] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)

  const byId = new Map(state.joins.map(j => [j.id, j]))
  const chosen = selected.map(id => byId.get(id)).filter((j): j is Join => j != null)
  const total = chosen.reduce((s, j) => s + j.amount, 0)
  // A lock is final, so also check what can't be fixed afterwards: every selected member's UTXOs must
  // exist and cover their share plus their part of the fee
  const funding = useQuery({
    queryKey: ['lock-funding', state.pool.id, selected],
    queryFn: async () => backend.tx.buildRegistration(state.pool, chosen, await fetchInputValues(chosen)).problems,
    enabled: chosen.length > 0
  })
  const problems = chosen.length > 0 ? [...selectionProblems(state.pool, chosen), ...(funding.data ?? [])] : []
  const ready = chosen.length > 0 && problems.length === 0 && funding.data != null && !funding.isFetching

  const toggle = (id: string): void => {
    setSelected(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  const lock = useWrite(async () => {
    if (activeIdentity == null) throw new Error('Connect your identity first')
    return await backend.platform.createLock(activeIdentity, { poolId: state.pool.id, joinIds: selected })
  })

  const submit = (): void => {
    lock.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false)
        notify('Pool locked. Members can sign now.')
      },
      onError: e => notify(errorMessage(e), 'error')
    })
  }

  if (state.joins.length === 0) return <EmptyState title='No joins yet'>Share the pool link to get members.</EmptyState>

  return (
    <div className='flex flex-col gap-5'>
      <div className='rounded-2xl bg-surface-2 p-4'>
        <div className='flex items-baseline justify-between gap-3 text-small'>
          <span><strong className='text-lead'>{formatDash(total)}</strong> <span className='text-muted'>selected of {formatDash(COLLATERAL)}</span></span>
          <span className='text-muted'>{chosen.length} / {MAX_SHARES} members</span>
        </div>
        <FillBar joined={total} className='mt-3' />
        <p className='mt-3 text-small text-muted'>The order you pick members in becomes the share order. It doesn’t change anyone’s rewards.</p>
      </div>

      <ul className='flex flex-col gap-2'>
        {state.joins.map(join => {
          const index = selected.indexOf(join.id)
          const banned = settings.banList.includes(join.ownerId)
          return (
            <li key={join.id}>
              <label className={cn(
                'flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors',
                index >= 0 ? 'border-brand bg-brand-soft' : 'border-line/70 hover:border-brand/50',
                banned && index < 0 && 'opacity-60'
              )}
              >
                <input type='checkbox' className='size-4 accent-[var(--brand)]' checked={index >= 0} onChange={() => toggle(join.id)} />
                <span className='flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-tag font-bold'>
                  {index >= 0 ? index + 1 : ''}
                </span>
                <div className='min-w-0 flex-1'>
                  <IdentityChip id={join.ownerId} size='sm' suffix={banned ? <span className='rounded-full bg-red-soft px-2 py-0.5 text-tag text-red-ink'>Banned</span> : null} />
                  <div className='mt-0.5 text-tag text-muted'>joined {relativeTime(join.createdAt)}</div>
                </div>
                <div className='text-right'>
                  <div className='font-bold'><Dash duffs={join.amount} /></div>
                  <button type='button' className='text-tag text-muted hover:text-red-ink' onClick={e => { e.preventDefault(); toggleBan(join.ownerId) }}>
                    {banned ? 'Unban' : 'Ban'}
                  </button>
                </div>
              </label>
            </li>
          )
        })}
      </ul>

      {problems.length > 0 && <Notice tone='warning' title='Not ready to lock'>{problems.join('. ')}.</Notice>}

      <Button colorScheme='brand' size='md' disabled={!ready} onClick={() => setConfirming(true)}>
        {chosen.length > 0 && funding.isFetching ? 'Checking members’ UTXOs…' : `Lock pool with ${chosen.length} members`}
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming} title='Lock the pool?' maxWidth='md' horizontalMargin={12} className='!rounded-3xl dark:!border-line dark:!bg-surface'>
        <div className='flex flex-col gap-4 text-small'>
          <p className='text-muted'>
            The lock is final. You can’t lock this pool again: if a member never signs or spends their coins, the pool
            stays unformed and you’ll need to create a new one.
          </p>
          <ol className='divide-y divide-line/70 rounded-2xl bg-surface-2 px-4'>
            {chosen.map((j, i) => (
              <li key={j.id} className='flex items-center justify-between gap-3 py-2.5'>
                <span className='flex items-center gap-2'><span className='text-muted'>{i + 1}.</span><IdentityChip id={j.ownerId} size='sm' /></span>
                <span className='font-bold'>{formatDash(j.amount)} <span className='font-normal text-muted'>· {rewardSharePercent(j.amount, state.pool.operatorReward).toFixed(1)}%</span></span>
              </li>
            ))}
          </ol>
          <Button colorScheme='brand' size='md' onClick={submit} disabled={lock.isPending}>{lock.isPending ? 'Publishing…' : 'Publish lock'}</Button>
        </div>
      </Dialog>
    </div>
  )
}

function LockedMembers ({ state }: { state: PoolState }): ReactNode {
  const { activeIdentity } = useWallet()
  const selectedIds = new Set(state.members.map(m => m.join.id))
  const others = state.joins.filter(j => !selectedIds.has(j.id))
  const showSigning = state.status === 'SIGNING'

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h3 className='mb-2 text-small font-bold text-muted'>Selected members, in share order</h3>
        <ul className='divide-y divide-line/70'>
          {state.members.map(m => (
            <li key={m.join.id} className='flex flex-wrap items-center justify-between gap-3 py-3'>
              <span className='flex min-w-0 items-center gap-3'>
                <span className='w-5 text-small text-muted'>{m.shareIndex + 1}</span>
                <IdentityChip id={m.join.ownerId} suffix={m.join.ownerId === activeIdentity ? <YouTag /> : null} />
              </span>
              <span className='flex items-center gap-4'>
                {showSigning && (
                  <span className='flex gap-1.5'>
                    <Tick done={m.consent != null} label='Consent' />
                    <Tick done={m.funding != null} label='Funding' />
                  </span>
                )}
                <span className='text-right'>
                  <span className='block font-bold'><Dash duffs={m.join.amount} /></span>
                  <span className='block text-tag text-muted'>{rewardSharePercent(m.join.amount, state.pool.operatorReward).toFixed(1)}% of rewards</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {others.length > 0 && (
        <div>
          <h3 className='mb-2 text-small font-bold text-muted'>Not selected</h3>
          <ul className='divide-y divide-line/70 opacity-70'>
            {others.map(join => (
              <li key={join.id} className='flex items-center justify-between gap-3 py-2.5'>
                <IdentityChip id={join.ownerId} size='sm' suffix={join.ownerId === activeIdentity ? <YouTag /> : null} />
                <Dash duffs={join.amount} className='text-small font-semibold' />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Tick ({ done, label }: { done: boolean, label: string }): ReactNode {
  return (
    <span className={cn('rounded-full px-2.5 py-1 text-tag font-semibold', done ? 'bg-mint-soft text-mint-ink' : 'bg-surface-2 text-muted')}>
      {done ? '✓ ' : ''}{label}
    </span>
  )
}
