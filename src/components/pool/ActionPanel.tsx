import { ProgressStepBar } from 'dash-ui-kit/react'
import { Button } from '../Button'
import { useState, type ReactNode } from 'react'
import { backend } from '../../data'
import type { PoolState } from '../../data/queries'
import { useWrite } from '../../hooks/data'
import { COLLATERAL } from '../../lib/consensus'
import { formatDash } from '../../lib/format'
import { useWallet } from '../../wallet/WalletContext'
import { Dash, FillBar } from '../bits'
import { JoinDialog } from '../JoinDialog'
import { SignPanel } from '../SignPanel'
import { errorMessage, useToast } from '../Toast'
import { Card, Notice } from '../ui'
import { OperatorKeyNotice } from './OperatorKeyNotice'
import { poolRole } from './role'

/** What the current user can do right now, by pool status and role */
export function ActionPanel ({ state, onShowMembers }: { state: PoolState, onShowMembers: () => void }): ReactNode {
  const { activeIdentity } = useWallet()
  const role = poolRole(state, activeIdentity)

  return (
    <Card className='flex flex-col gap-5'>
      {(state.status === 'NEW' || state.status === 'SIGNING') && <OperatorKeyNotice usage={state.operatorKey} />}
      {state.status === 'NEW' && <NewActions state={state} onShowMembers={onShowMembers} />}
      {state.status === 'SIGNING' && <SigningActions state={state} />}
      {(state.status === 'FORMED' || state.status === 'ERROR' || state.status === 'REGISTERED' || state.status === 'DISSOLVING') && <RunningActions state={state} />}
      {state.status === 'DISSOLVED' && (
        <div>
          <h2 className='text-section'>Dissolved</h2>
          <p className='mt-2 text-small text-muted'>
            This masternode was dissolved and every member’s principal went back to their refund address.
          </p>
        </div>
      )}
      {role.me == null && <ConnectPrompt />}
    </Card>
  )
}

function ConnectPrompt (): ReactNode {
  const { status, openLogin } = useWallet()
  return (
    <div className='flex flex-col gap-3 rounded-2xl bg-surface-2 p-4 text-small'>
      <span className='text-muted'>Log in with your identity keys to join or sign.</span>
      <Button size='sm' colorScheme='brand' onClick={openLogin} disabled={status === 'connecting'}>
        Log in
      </Button>
    </div>
  )
}

function NewActions ({ state, onShowMembers }: { state: PoolState, onShowMembers: () => void }): ReactNode {
  const { activeIdentity } = useWallet()
  const role = poolRole(state, activeIdentity)
  const [joinOpen, setJoinOpen] = useState(false)
  const total = state.joins.reduce((s, j) => s + j.amount, 0)

  return (
    <>
      <div>
        <div className='text-small text-muted'>Joined so far</div>
        <div className='mt-1 flex items-baseline gap-1.5'>
          <Dash duffs={total} className='text-[28px] leading-8 font-extrabold tracking-[-0.03em]' />
          <span className='text-muted'>of 1000</span>
        </div>
        <FillBar joined={total} className='mt-3' />
        <div className='mt-2 text-small text-muted'>
          {total < COLLATERAL
            ? `${formatDash(COLLATERAL - total)} more needed before the creator can lock`
            : 'Enough joins: the creator can select members and lock'}
        </div>
      </div>

      {role.isCreator && (
        <div className='flex flex-col gap-2'>
          <Button colorScheme='brand' size='md' onClick={onShowMembers}>Select members and lock</Button>
          <span className='text-small text-muted'>Pick joins that add up to exactly 1000 DASH. The lock is final.</span>
        </div>
      )}

      {!backend.features.registration && (
        <Notice tone='info' title='Signing is not wired in this build'>
          Pools, joins and the lock work on testnet. The registration transaction builder is still being wired, so
          there is nothing to sign yet.
        </Notice>
      )}

      {role.me != null && role.myJoin == null && (
        <>
          <Button colorScheme={role.isCreator ? 'lightBlue' : 'brand'} size='md' onClick={() => setJoinOpen(true)}>
            {role.isCreator ? 'Join your own pool' : 'Join pool'}
          </Button>
          <JoinDialog pool={state.pool} open={joinOpen} onOpenChange={setJoinOpen} />
        </>
      )}

      {role.myJoin != null && (
        <Notice tone='success' title={`You joined with ${formatDash(role.myJoin.amount)}`}>
          {role.isCreator
            ? 'Keep your UTXOs unspent until the pool registers.'
            : 'Waiting for the creator to lock the pool. Keep your UTXOs unspent until then.'}
        </Notice>
      )}
    </>
  )
}

function SigningActions ({ state }: { state: PoolState }): ReactNode {
  const { activeIdentity } = useWallet()
  const { notify } = useToast()
  const role = poolRole(state, activeIdentity)
  const n = state.members.length
  const stepIndex = { consent: 1, funding: 2, broadcast: 3, confirming: 4 }[state.stage ?? 'consent']
  // Consents and funding signatures only mean something against a real v24 registration transaction
  const canSign = backend.features.registration

  const broadcast = useWrite(async () => {
    if (state.finalTx == null) throw new Error('The transaction is not complete')
    return await backend.chain.broadcastTransaction(state.finalTx.hex)
  })

  const runBroadcast = (): void => {
    broadcast.mutate(undefined, {
      onSuccess: () => notify('Registration broadcast. Waiting for a block.'),
      onError: e => notify(`Broadcast failed: ${errorMessage(e)}`, 'error')
    })
  }

  return (
    <>
      {state.lockProblems.length > 0 && <h2 className='text-section'>Locked</h2>}
      <div className={state.lockProblems.length > 0 ? 'hidden' : undefined}>
        <div className='flex items-center justify-between text-small'>
          <span className='font-bold'>
            {state.stage === 'consent' && 'Collecting consents'}
            {state.stage === 'funding' && 'Collecting funding signatures'}
            {state.stage === 'broadcast' && 'Ready to broadcast'}
            {state.stage === 'confirming' && 'Waiting for a block'}
          </span>
          <span className='text-muted'>Step {stepIndex} of 4</span>
        </div>
        <ProgressStepBar currentStep={stepIndex} totalSteps={4} className='mt-3' />
        <div className='mt-3 grid grid-cols-2 gap-2 text-small'>
          <div className='rounded-2xl bg-surface-2 px-3 py-2'><span className='text-muted'>Consents</span> <strong>{state.consentCount}/{n}</strong></div>
          <div className='rounded-2xl bg-surface-2 px-3 py-2'><span className='text-muted'>Funding</span> <strong>{state.fundingCount}/{n}</strong></div>
        </div>
      </div>

      {state.lockProblems.length > 0 && (
        <Notice tone='error' title='This lock cannot form'>
          {state.lockProblems.join('. ')}. The creator has to start a new pool.
        </Notice>
      )}

      {!canSign && state.lockProblems.length === 0 && (
        <Notice tone='info' title='Signing is not wired in this build'>
          This pool is locked, but the registration transaction builder is still being wired, so the registration
          cannot be built or signed yet.
        </Notice>
      )}

      {canSign && state.lockProblems.length === 0 && role.myMember != null && (
        <>
          {state.stage === 'consent' && role.myMember.consent == null && <SignPanel kind='consent' state={state} member={role.myMember} />}
          {state.stage === 'funding' && role.myMember.funding == null && <SignPanel kind='funding' state={state} member={role.myMember} />}
          {((state.stage === 'consent' && role.myMember.consent != null) || (state.stage === 'funding' && role.myMember.funding != null)) && (
            <Notice tone='success' title='Your part is done'>Waiting for the other members to sign.</Notice>
          )}
        </>
      )}

      {role.myJoin != null && role.myMember == null && (
        <Notice tone='info' title='You were not selected'>
          The creator locked the pool with other members. Your coins were never used.
        </Notice>
      )}

      {state.stage === 'broadcast' && state.broadcastProblems.length > 0 && (
        <Notice tone='error' title='Not ready to broadcast'>
          {state.broadcastProblems.join('. ')}.
        </Notice>
      )}

      {canSign && state.stage === 'broadcast' && state.lockProblems.length === 0 && (
        <div className='flex flex-col gap-2'>
          <Button
            colorScheme='mint'
            size='md'
            className='font-bold'
            onClick={runBroadcast}
            disabled={broadcast.isPending || state.broadcastProblems.length > 0}
          >
            {broadcast.isPending ? 'Broadcasting…' : 'Broadcast registration'}
          </Button>
          <span className='text-small text-muted'>
            {role.isCreator ? 'All signatures are in.' : 'All signatures are in. The creator usually broadcasts, but anyone can.'}
            {' '}If a member spent a committed UTXO, the network rejects it and this pool can’t form.
          </span>
        </div>
      )}

      {state.stage === 'confirming' && (
        <Notice tone='info' title='Broadcast'>The registration is in the mempool. It becomes a masternode in the next block.</Notice>
      )}
    </>
  )
}

function RunningActions ({ state }: { state: PoolState }): ReactNode {
  return (
    <>{state.status === 'FORMED'
      ? <Notice tone='success' title='Masternode is running'>Rewards go straight to each member’s reward address.</Notice>
      : state.status === 'DISSOLVING'
        ? (
          <Notice tone='info' title='Dissolution broadcast'>
            The dissolution is confirming. Every share goes back to its refund address once the transaction is in a
            chainlocked block — the masternode list keeps showing the old entry for a few minutes until then.
          </Notice>
          )
        : state.status === 'REGISTERED'
        ? (
          <Notice tone='info' title='Registered, waiting for the operator'>
            The registration is on chain and the masternode is listed, but inactive until the operator sets its
            address with a ProUpServTx — within an hour of registration to stay in good standing.
          </Notice>
          )
        : state.masternode?.service === ''
          ? (
            <Notice tone='warning' title='Waiting for the operator'>
              The masternode registered without an address, so it starts inactive. It begins earning once the operator
              sets its address with a ProUpServTx.
            </Notice>
            )
          : (
            <Notice tone='error' title='Masternode is not valid'>
              It was PoSe-banned or revoked and earns nothing until the operator fixes the node and sends a ProUpServTx.
            </Notice>
            )}</>
  )
}
