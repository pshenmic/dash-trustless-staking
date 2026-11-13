import { useState, type ReactNode } from 'react'
import { backend } from '../../data'
import type { PoolState } from '../../data/queries'
import { useWrite } from '../../hooks/data'
import { formatDash } from '../../lib/format'
import { useWallet } from '../../wallet/WalletContext'
import { Button } from '../Button'
import { FeeFundingPanel, SignPanel } from '../SignPanel'
import { errorMessage, useToast } from '../Toast'
import { CodeBlock, EmptyState, IdentifierValue, Notice } from '../ui'
import { poolRole } from './role'

const DASHSCAN = 'https://testnet.dashscan.io/transactions'

/**
 * The full-width surface for a pool action. It replaces the sheet body (details, tabs and bar are
 * hidden) so the transaction hex, commands and key fields get the whole width.
 */
export function ActionView ({ state, view, onBack }: {
  state: PoolState
  view: 'sign' | 'broadcast'
  onBack: () => void
}): ReactNode {
  const { activeIdentity } = useWallet()
  const role = poolRole(state, activeIdentity)
  const { notify } = useToast()
  const [feePrefill, setFeePrefill] = useState<string | null>(null)

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
    <div className='flex flex-col gap-5'>
      <div className='flex items-center justify-between gap-3'>
        <button type='button' onClick={onBack} className='text-small font-bold text-muted hover:text-fg'>← Back to the pool</button>
        <span className='text-small font-extrabold'>{view === 'sign' ? 'Sign' : 'Broadcast registration'}</span>
      </div>

      {view === 'sign' && (
        <>
          {state.lockProblems.length > 0 && (
            <Notice tone='error' title='This lock cannot form'>
              {state.lockProblems.join('. ')}. The creator has to start a new pool.
            </Notice>
          )}

          {state.lockProblems.length === 0 && role.myMember != null && state.stage === 'consent' && role.myMember.consent == null && (
            <SignPanel kind='consent' state={state} member={role.myMember} />
          )}

          {state.lockProblems.length === 0 && role.myMember != null && state.stage === 'funding' && role.myMember.funding == null && (
            <SignPanel
              kind='funding'
              state={state}
              member={role.myMember}
              onFeeSignature={hex => setFeePrefill(hex)}
            />
          )}

          {state.lockProblems.length === 0 && role.isCreator && state.pool.feePayer === 'creator' && state.feeFunding == null && state.stage === 'funding' && (
            <FeeFundingPanel state={state} prefill={feePrefill} />
          )}

          {state.lockProblems.length === 0 && role.myMember != null &&
            (state.stage === 'consent' ? role.myMember.consent != null : role.myMember.funding != null) &&
            !(role.isCreator && state.pool.feePayer === 'creator' && state.feeFunding == null && state.stage === 'funding') && (
              <Notice tone='success' title='Your part is done'>Waiting for the other members.</Notice>
            )}

          {state.lockProblems.length === 0 && role.myMember == null &&
            !(role.isCreator && state.pool.feePayer === 'creator' && state.feeFunding == null && state.stage === 'funding') && (
              <Notice tone='info' title='Nothing to sign'>You are not a member of this pool.</Notice>
            )}
        </>
      )}

      {view === 'broadcast' && (
        <>
          {state.finalTx == null
            ? <EmptyState title='The transaction is not complete'>Every consent and funding signature has to be in before the registration can be broadcast.</EmptyState>
            : (
              <>
                <section>
                  <h3 className='mb-2 text-small font-bold text-muted'>Registration transaction</h3>
                  <div className='flex flex-col gap-2 rounded-2xl bg-surface-2 p-4'>
                    <div className='flex items-center gap-2 text-small'>
                      <span className='shrink-0 text-muted'>ProTx hash</span>
                      <IdentifierValue value={state.finalTx.txid} href={`${DASHSCAN}/${state.finalTx.txid}`} label='ProTx hash' />
                    </div>
                    {state.registration != null && (
                      <div className='text-tag text-muted'>
                        {state.members.length} shares · registration fee {formatDash(state.pool.fee)}
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <h3 className='mb-2 text-small font-bold text-muted'>Raw transaction</h3>
                  <CodeBlock>{state.finalTx.hex}</CodeBlock>
                </section>
              </>
              )}

          {state.broadcastProblems.length > 0 && (
            <Notice tone='error' title='Not ready to broadcast'>
              {state.broadcastProblems.join('. ')}.
            </Notice>
          )}

          <Button
            colorScheme='mint'
            size='md'
            className='font-bold'
            onClick={runBroadcast}
            disabled={state.finalTx == null || broadcast.isPending || state.broadcastProblems.length > 0}
          >
            {broadcast.isPending ? 'Broadcasting…' : 'Broadcast registration'}
          </Button>
          <p className='text-small text-muted'>
            {role.isCreator ? 'All signatures are in.' : 'All signatures are in. The creator usually broadcasts, but anyone can.'}
            {' '}If a member spent a committed UTXO, the network rejects it and this pool can’t form.
          </p>
        </>
      )}
    </div>
  )
}