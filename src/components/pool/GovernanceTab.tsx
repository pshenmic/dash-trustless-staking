import { Input } from 'dash-ui-kit/react'
import { useState, type ReactNode } from 'react'
import { backend } from '../../data'
import { createTestVotes } from '../../data/mock/mockBackend'
import type { PoolState } from '../../data/queries'
import { useVotes, useWrite } from '../../hooks/data'
import { HOSTING_VOTING_ADDRESS } from '../../hosting'
import { blocksToDuration, formatDash } from '../../lib/format'
import { useNetwork } from '../../lib/network'
import type { Vote, VoteOutcome } from '../../lib/types'
import { cycleLocked, isProposalHash, latestMemberChoices, lockHeight, tally } from '../../lib/voting'
import { useWallet } from '../../wallet/WalletContext'
import { IdentityChip } from '../bits'
import { Button } from '../Button'
import { NetworkPanel } from '../governance/NetworkPanel'
import { errorMessage, useToast } from '../Toast'
import { cn, EmptyState, IdentifierValue, Loading } from '../ui'
import { poolRole } from './role'

const OUTCOMES: Array<{ value: VoteOutcome, label: string }> = [
  { value: 1, label: 'YES' },
  { value: 2, label: 'NO' },
  { value: 3, label: 'ABSTAIN' }
]
const outcomeLabel = (outcome: VoteOutcome | null | undefined): string =>
  outcome == null ? 'No choice' : OUTCOMES.find(o => o.value === outcome)?.label ?? 'No choice'

export function GovernanceTab ({ state }: { state: PoolState }): ReactNode {
  const { data, isLoading, error } = useVotes(state.pool.id, state.pool.votingAddress === HOSTING_VOTING_ADDRESS)
  const { activeIdentity } = useWallet()
  const { network } = useNetwork()
  const role = poolRole(state, activeIdentity)
  const members = state.members.map(m => m.join)
  const latest = latestMemberChoices(data ?? [], members)
  const byProposal = new Map<string, Vote[]>()
  for (const v of latest) {
    const list = byProposal.get(v.proposalHash) ?? []
    list.push(v)
    byProposal.set(v.proposalHash, list)
  }
  const totalStake = members.reduce((s, j) => s + j.amount, 0)
  const locked = cycleLocked(state.height, network)
  const lock = lockHeight(state.height, network)
  const testVotes = useWrite(async () => createTestVotes(state.pool.id))

  // A custom voting address means the key is held outside the voting service: no shared voting
  if (state.pool.votingAddress !== HOSTING_VOTING_ADDRESS) {
    return (
      <div className='flex flex-col gap-4'>
        <EmptyState title='This pool can’t participate in shared voting'>
          A custom voting address is set, so its key is held outside the voting service and member choices can’t be cast as the pool’s vote.
        </EmptyState>
        <IdentifierValue value={state.pool.votingAddress} label='Voting address' />
      </div>
    )
  }

  if (isLoading) return <Loading />
  if (error != null) return <EmptyState title='Could not load votes'>{String(error)}</EmptyState>

  return (
    <div className='flex flex-col gap-6'>
      {backend.mode === 'mock' && (
        <div className='self-start'>
          <Button size='sm' colorScheme='mint' disabled={testVotes.isPending} onClick={() => testVotes.mutate(undefined)}>
            {testVotes.isPending ? 'Adding…' : 'Add test votes'}
          </Button>
        </div>
      )}
      {role.myMember != null && <VoteForm poolId={state.pool.id} latest={latest} />}

      {byProposal.size === 0 && (
        <EmptyState title='No choices yet'>Paste a proposal hash from a governance explorer or the forum.</EmptyState>
      )}

      {[...byProposal.entries()].map(([hash, choices]) => {
        const result = tally(choices, members)
        const votedStake = choices.reduce((s, c) => s + (members.find(j => j.ownerId === c.ownerId)?.amount ?? 0), 0)
        return (
          <section key={hash} className='flex flex-col gap-3 rounded-2xl bg-surface-2 p-4'>
            <IdentifierValue value={hash} label='Proposal' />
            <ul className='flex flex-col gap-2'>
              {members.map(j => {
                const choice = choices.find(c => c.ownerId === j.ownerId)
                return (
                  <li key={j.id} className='flex flex-wrap items-center justify-between gap-2 text-small'>
                    <IdentityChip id={j.ownerId} size='sm' />
                    <span className='flex items-center gap-3'>
                      <span className='font-bold'>{outcomeLabel(choice?.outcome)}</span>
                      <span className='text-muted'>{formatDash(j.amount)}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
            <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-tag text-muted'>
              <span>Pool choice: <strong className='text-fg'>{result == null ? '—' : outcomeLabel(result)}</strong></span>
              <span>Participation: {formatDash(votedStake)} / {formatDash(totalStake)}</span>
            </div>
            <NetworkPanel proposalHash={hash} excludePoolId={state.pool.id} />
            {locked
              ? <p className='text-tag text-muted'>This cycle is locked — new choices count toward the next superblock.</p>
              : <p className='text-tag text-muted'>Choices lock at block {lock} ({blocksToDuration(lock - state.height)}).</p>}
          </section>
        )
      })}

      <p className='text-tag text-muted'>Choices are recorded on Platform, not on Dash Core. The latest choice per member counts, weighted by stake; an exact tie abstains. The operator service that casts the pool’s vote is not live yet.</p>
    </div>
  )
}

function VoteForm ({ poolId, latest }: { poolId: string, latest: Vote[] }): ReactNode {
  const { activeIdentity } = useWallet()
  const { notify } = useToast()
  const [hash, setHash] = useState('')
  const [picked, setPicked] = useState<VoteOutcome | null>(null)
  const normalized = hash.trim().toLowerCase()
  const valid = isProposalHash(normalized)
  const mine = valid ? latest.find(v => v.ownerId === activeIdentity && v.proposalHash === normalized) ?? null : null
  const outcome = picked ?? mine?.outcome ?? null

  const submit = useWrite(async () => {
    if (activeIdentity == null) throw new Error('Connect your identity first')
    if (outcome == null) throw new Error('Pick a choice first')
    return await backend.platform.createVote(activeIdentity, { poolId, proposalHash: normalized, outcome })
  })

  return (
    <div className='flex flex-col gap-3 rounded-2xl border border-line/70 p-4'>
      <span className='text-small font-bold'>Record your choice</span>
      <Input
        id='vote-proposal'
        value={hash}
        onChange={e => { setHash(e.target.value); setPicked(null) }}
        placeholder='Proposal hash (64 hex characters)'
        spellCheck={false}
        aria-label='Proposal hash'
      />
      {normalized !== '' && !valid && <span className='text-tag text-red-ink'>A proposal hash is exactly 64 hex characters.</span>}
      <div className='flex gap-2' role='radiogroup' aria-label='Choice'>
        {OUTCOMES.map(o => (
          <button
            key={o.value}
            type='button'
            role='radio'
            aria-checked={outcome === o.value}
            onClick={() => setPicked(o.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-tag font-bold',
              outcome === o.value ? 'border-brand-ink text-brand-ink' : 'border-line text-muted hover:text-fg'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className='flex items-center justify-between gap-3'>
        <span className='text-tag text-muted'>
          {mine != null ? `Your current choice: ${outcomeLabel(mine.outcome)}. Publishing again replaces it.` : 'Choices are public and permanent; the latest one counts.'}
        </span>
        <Button
          size='sm'
          colorScheme='brand'
          disabled={!valid || outcome == null || submit.isPending}
          onClick={() => submit.mutate(undefined, { onSuccess: () => { notify('Choice recorded'); setPicked(null) }, onError: e => notify(errorMessage(e), 'error') })}
        >
          {mine != null ? 'Update choice' : 'Record choice'}
        </Button>
      </div>
    </div>
  )
}