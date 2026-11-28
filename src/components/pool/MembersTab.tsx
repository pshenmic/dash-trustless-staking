import { CopyButton, Dialog, Input } from 'dash-ui-kit/react'
import { Button } from '../Button'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { backend } from '../../data'
import { lockSupportsEntries } from '../../contracts'
import { fetchInputValues, type PoolState } from '../../data/queries'
import { useGeneration } from '../../generations'
import { useOnchainShareOwners, usePoolSummaries, useWrite } from '../../hooks/data'
import { COLLATERAL, MAX_SHARES } from '../../lib/consensus'
import { formatDash, relativeTime } from '../../lib/format'
import { lockEntryOf, packingProblems } from '../../lib/lockEntries'
import { useNetwork } from '../../lib/network'
import { onchainOwnerProblems, rewardSharePercent, selectionProblems, shareOwnerConflicts } from '../../lib/rules'
import { useSettings } from '../../lib/settings'
import type { Join, Outpoint, Prevout } from '../../lib/types'
import { useWallet } from '../../wallet/WalletContext'
import { Dash, FillBar, IdentityChip, YouTag } from '../bits'
import { parseOutpoint } from '../JoinDialog'
import { errorMessage, useToast } from '../Toast'
import { cn, EmptyState, KeyValue, KeyValueList, Notice } from '../ui'
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
  const [open, setOpen] = useState<string | null>(null)
  if (state.joins.length === 0) return <EmptyState title='No shares yet'>Be the first to take a share in this pool.</EmptyState>
  return (
    <ul className='divide-y divide-line/70'>
      {state.joins.map(join => (
        <li key={join.id} className='py-3'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <IdentityChip id={join.ownerId} suffix={join.ownerId === activeIdentity ? <YouTag /> : null} />
            <div className='flex items-center gap-3'>
              <div className='text-right'>
                <div className='font-bold'><Dash duffs={join.amount} /></div>
                <div className='text-tag text-muted'>joined {relativeTime(join.createdAt)}</div>
              </div>
              <Button size='sm' onClick={() => setOpen(open === join.id ? null : join.id)}>
                {open === join.id ? 'Hide details' : 'Details'}
              </Button>
            </div>
          </div>
          {open === join.id && <div className='mt-4'><ShareDetails join={join} prevouts={state.prevouts} /></div>}
        </li>
      ))}
    </ul>
  )
}

/**
 * One share in full: the three addresses that decide where its money goes, plus the UTXOs it commits.
 * Every value is copyable and shown complete — these are what a member checks against their own wallet.
 */
function ShareDetails ({ join, prevouts }: { join: Join, prevouts: Map<string, Prevout | null> }): ReactNode {
  const total = join.inputs.reduce((sum, outpoint) => sum + (prevouts.get(`${outpoint.txid}:${outpoint.vout}`)?.value ?? 0), 0)
  const missing = join.inputs.filter(outpoint => prevouts.get(`${outpoint.txid}:${outpoint.vout}`) == null).length
  const reward = join.rewardAddress != null && join.rewardAddress !== '' ? join.rewardAddress : null

  return (
    <div className='rounded-2xl bg-surface-2/60 p-4'>
      <KeyValueList>
        <KeyValue label='Owner address' hint='The key that signs this share’s consent; unique across the network'>
          <AddressLine value={join.ownerAddress} />
        </KeyValue>
        <KeyValue label='Refund address' hint='Where this share’s principal returns if the pool dissolves'>
          <AddressLine value={join.refundAddress} />
        </KeyValue>
        <KeyValue label='Reward address' hint={reward == null ? 'Left empty, so the refund address receives the rewards' : 'Receives this share’s masternode payouts'}>
          {reward == null ? <span className='text-small text-muted'>Same as the refund address</span> : <AddressLine value={reward} />}
        </KeyValue>
        <KeyValue label='Change address' hint='A registration output: whatever its UTXOs hold beyond the share, fee share and entry fee'>
          <AddressLine value={join.changeAddress} />
        </KeyValue>
        <KeyValue
          label={`Inputs · ${join.inputs.length}`}
          hint={missing > 0 ? `${formatDash(total)} known, ${missing} value${missing === 1 ? '' : 's'} unreadable` : `${formatDash(total)} committed in total`}
          wide
        >
          <ul className='flex flex-col gap-1.5'>
            {join.inputs.map(outpoint => {
              const prevout = prevouts.get(`${outpoint.txid}:${outpoint.vout}`)
              return (
                <li key={`${outpoint.txid}:${outpoint.vout}`} className='flex items-center justify-between gap-2 font-mono text-tag'>
                  <span className='break-all'>{outpoint.txid}:{outpoint.vout}</span>
                  <span className='flex shrink-0 items-center gap-1'>
                    <span className='text-muted'>{prevout == null ? '—' : formatDash(prevout.value)}</span>
                    <CopyButton text={`${outpoint.txid}:${outpoint.vout}`} aria-label='Copy outpoint' />
                  </span>
                </li>
              )
            })}
          </ul>
        </KeyValue>
      </KeyValueList>
    </div>
  )
}

function AddressLine ({ value }: { value: string }): ReactNode {
  return (
    <span className='flex items-center gap-1.5'>
      <span className='font-mono text-small break-all'>{value}</span>
      <CopyButton text={value} aria-label='Copy address' />
    </span>
  )
}

/** Creator view before the lock: pick joins that add up to exactly 1000 DASH, in share order */
function LockSelector ({ state }: { state: PoolState }): ReactNode {
  const { activeIdentity } = useWallet()
  const { settings, toggleBan } = useSettings()
  const { ref } = useGeneration()
  const { network } = useNetwork()
  const { notify } = useToast()
  const [selected, setSelected] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const creatorPays = state.pool.feePayer === 'creator'
  const [feeUtxos, setFeeUtxos] = useState<string[]>([''])
  const [feeChangeAddress, setFeeChangeAddress] = useState('')

  const byId = new Map(state.joins.map(j => [j.id, j]))
  const chosen = selected.map(id => byId.get(id)).filter((j): j is Join => j != null)
  // Another pool may be collecting shares with the same owner key. Legal while neither is registered,
  // but only one of them can ever be mined — the fatal case (a live masternode's key) needs the chain.
  const summaries = usePoolSummaries()
  const conflicts = shareOwnerConflicts(
    chosen,
    (summaries.data ?? []).map(s => ({
      id: s.pool.id, name: s.pool.name, ownerAddresses: s.ownerAddresses, locked: s.lock != null
    })),
    state.pool.id
  )
  // Another pool that already locked has committed that share table: only one of us can register, and
  // its registration is the one already under way. A pool still forming is a warning, not a block.
  const lockedConflicts = conflicts.filter(c => c.locked)
  const openConflicts = conflicts.filter(c => !c.locked)
  // Optional index: while it is loading or unreachable `data` is null and the check is skipped
  const onchain = useOnchainShareOwners()
  const total = chosen.reduce((s, j) => s + j.amount, 0)
  const feeOutpoints = feeUtxos.map(parseOutpoint)
  const feeInputs = feeOutpoints.filter((o): o is Outpoint => o != null)
  const feeValues = useQuery({
    queryKey: ['lock-fee-outputs', state.pool.id, feeOutpoints.map(o => o == null ? '' : `${o.txid}:${o.vout}`)],
    queryFn: async () => await Promise.all(feeOutpoints.map(async o => o == null ? null : await backend.chain.getOutputValue(o))),
    enabled: creatorPays && feeOutpoints.some(o => o != null)
  })
  // A lock is final, so also check what can't be fixed afterwards: every selected member's UTXOs must
  // exist and cover their share plus their part of the fee, and the creator fee input must be there
  const funding = useQuery({
    queryKey: ['lock-funding', state.pool.id, selected, feeOutpoints.map(o => o == null ? '' : `${o.txid}:${o.vout}`), feeChangeAddress],
    queryFn: async () => {
      try {
        const change = feeChangeAddress.trim() === '' ? undefined : feeChangeAddress.trim()
        return backend.tx.buildRegistration(state.pool, chosen, await fetchInputValues(chosen, feeInputs), feeInputs, change).problems
      } catch (e) {
        return [errorMessage(e)]
      }
    },
    enabled: chosen.length > 0
  })
  const feeInputProblem = creatorPays
    ? feeUtxos.some(value => value.trim() !== '' && parseOutpoint(value) == null)
      ? 'Enter each fee UTXO as txid:vout'
      : new Set(feeOutpoints.filter((o): o is Outpoint => o != null).map(o => `${o.txid}:${o.vout}`)).size < feeOutpoints.filter(o => o != null).length
        ? 'The same fee UTXO is listed twice'
        : null
    : null
  // Generation 1's lock has no entries field, so the packed copies are only written where the schema has it
  const entries = lockSupportsEntries(ref) ? chosen.map(lockEntryOf) : null
  const problems = chosen.length > 0
    ? [
        ...selectionProblems(state.pool, chosen),
        ...(onchain.data?.ok === true ? onchainOwnerProblems(chosen, onchain.data.owners) : []),
        ...lockedConflicts.map(c => `${c.address} is already a share owner in ${c.poolName}, which has locked its shares`),
        // The mock backend's share addresses are placeholders, so only real data can be packed
        ...(entries != null && backend.mode === 'live' ? packingProblems(entries, network) : []),
        ...(funding.data ?? []),
        ...(feeInputProblem != null ? [feeInputProblem] : [])
      ]
    : []
  const ready = chosen.length > 0 && problems.length === 0 && funding.data != null && !funding.isFetching

  const toggle = (id: string): void => {
    setSelected(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  const lock = useWrite(async () => {
    if (activeIdentity == null) throw new Error('Connect your identity first')
    const feeChange = feeChangeAddress.trim()
    return await backend.platform.createLock(activeIdentity, {
      poolId: state.pool.id,
      joinIds: selected,
      // The lock carries the accepted shares themselves, so an auditor does not need to resolve each join
      ...(entries != null ? { entries } : {}),
      ...(creatorPays
        ? { feeInputs, ...(feeChange !== '' ? { feeChangeAddress: feeChange } : {}) }
        : {})
    })
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

  if (state.joins.length === 0) return <EmptyState title='No shares yet'>Send the pool link around to get members.</EmptyState>

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

      {creatorPays && (
        <div className='flex flex-col gap-3 rounded-2xl bg-surface-2 p-4'>
          <div>
            <span className='text-small font-bold'>Creator fee UTXOs</span>
            <p className='mt-1 text-small text-muted'>
              They must cover the {formatDash(state.pool.fee)} registration fee. The rest goes to the change address.
            </p>
          </div>
          {feeUtxos.map((value, i) => (
            <div key={i} className='flex gap-2'>
              <Input
                value={value}
                onChange={e => setFeeUtxos(list => list.map((v, k) => k === i ? e.target.value : v))}
                placeholder='txid:vout'
                spellCheck={false}
                aria-label={`Fee UTXO ${i + 1}`}
                className='w-full font-mono text-small'
              />
              <span className='w-24 shrink-0 self-center text-right text-small text-muted'>
                {feeOutpoints[i] == null ? '' : feeValues.data?.[i] == null ? (feeValues.isFetching ? '…' : 'not found') : formatDash(feeValues.data[i] as number)}
              </span>
              {feeUtxos.length > 1 && (
                <button type='button' onClick={() => setFeeUtxos(list => list.filter((_, k) => k !== i))} className='px-2 text-muted hover:text-red-ink' aria-label={`Remove fee UTXO ${i + 1}`}>✕</button>
              )}
            </div>
          ))}
          <button type='button' onClick={() => setFeeUtxos(list => [...list, ''])} className='self-start text-small font-bold text-brand-ink hover:underline'>+ Add fee UTXO</button>
          <label className='flex flex-col gap-1'>
            <span className='text-small font-bold'>Fee change address</span>
            <Input value={feeChangeAddress} onChange={e => setFeeChangeAddress(e.target.value)} placeholder='y…' spellCheck={false} />
            <span className='text-small text-muted'>Where the fee input’s change goes. Required when the UTXO is larger than the fee.</span>
          </label>
        </div>
      )}

      {problems.length > 0 && <Notice tone='warning' title='Not ready to lock'>{problems.join('. ')}.</Notice>}

      {openConflicts.length > 0 && (
        <Notice tone='warning' title={`Owner address also used by ${openConflicts.length === 1 ? 'another pool' : 'other pools'}`}>
          {openConflicts.map((conflict, i) => (
            <span key={conflict.joinId}>
              {i > 0 && ' '}
              <span className='font-mono break-all'>{conflict.address}</span> is a share owner in{' '}
              <Link to={`/pools/${conflict.poolId}`} className='font-bold text-brand-ink hover:underline'>{conflict.poolName}</Link>.
            </span>
          ))}{' '}
          Only one of the two pools can register; lock yours first to be the one that does.
        </Notice>
      )}

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
  const [open, setOpen] = useState<string | null>(null)
  const selectedIds = new Set(state.members.map(m => m.join.id))
  const others = state.joins.filter(j => !selectedIds.has(j.id))
  const showSigning = state.status === 'SIGNING'
  const toggle = (id: string): void => setOpen(open === id ? null : id)

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h3 className='mb-2 text-small font-bold text-muted'>Selected members, in share order</h3>
        <ul className='divide-y divide-line/70'>
          {state.members.map(m => (
            <li key={m.join.id} className='py-3'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
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
                  <Button size='sm' onClick={() => toggle(m.join.id)}>{open === m.join.id ? 'Hide' : 'Details'}</Button>
                </span>
              </div>
              {open === m.join.id && <div className='mt-4'><ShareDetails join={m.join} prevouts={state.prevouts} /></div>}
            </li>
          ))}
        </ul>
      </div>
      {others.length > 0 && (
        <div>
          <h3 className='mb-2 text-small font-bold text-muted'>Not selected</h3>
          <ul className='divide-y divide-line/70 opacity-70'>
            {others.map(join => (
              <li key={join.id} className='py-2.5'>
                <div className='flex items-center justify-between gap-3'>
                  <IdentityChip id={join.ownerId} size='sm' suffix={join.ownerId === activeIdentity ? <YouTag /> : null} />
                  <span className='flex items-center gap-3'>
                    <Dash duffs={join.amount} className='text-small font-semibold' />
                    <Button size='sm' onClick={() => toggle(join.id)}>{open === join.id ? 'Hide' : 'Details'}</Button>
                  </span>
                </div>
                {open === join.id && <div className='mt-4'><ShareDetails join={join} prevouts={state.prevouts} /></div>}
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
