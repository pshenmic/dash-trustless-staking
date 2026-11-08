import { CopyButton, Dialog, Input, Textarea } from 'dash-ui-kit/react'
import { Button } from './Button'
import { useState, type ReactNode } from 'react'
import { backend } from '../data'
import { mockDissolutionHex } from '../data/mock/mockTxBuilder'
import type { MemberState, PoolState } from '../data/queries'
import { useWrite } from '../hooks/data'
import { DEFAULT_DISSOLVE_FEE, MAX_DISSOLVE_FEE } from '../lib/consensus'
import { blocksToDuration, formatDash, parseDash, shortId } from '../lib/format'
import { previewUnilateralDissolve } from '../lib/rules'
import { IdentityChip } from './bits'
import { errorMessage, useToast } from './Toast'
import { CodeBlock, Field, Notice } from './ui'

interface Props {
  state: PoolState
  member: MemberState
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Unilateral dissolution (ProDisTx): built and signed in the member's wallet, broadcast from here */
export function DissolveDialog ({ state, member, open, onOpenChange }: Props): ReactNode {
  const { notify } = useToast()
  const [feeText, setFeeText] = useState(String(DEFAULT_DISSOLVE_FEE / 1e8))
  const [signed, setSigned] = useState('')
  const proTxHash = state.finalTx?.txid ?? ''

  const fee = parseDash(feeText)
  const feeError = fee == null ? 'Enter a fee' : fee <= 0 || fee > MAX_DISSOLVE_FEE ? `Between 0 and ${formatDash(MAX_DISSOLVE_FEE)} (consensus limit)` : null
  const preview = previewUnilateralDissolve(
    state.members.map(m => m.join.amount), member.shareIndex, state.pool.earlyPeriodBlocks, state.pool.earlyPenalty,
    state.registeredHeight ?? state.height, state.height, fee ?? DEFAULT_DISSOLVE_FEE
  )
  const signedValid = signed.trim() !== '' && backend.tx.verifyDissolution(proTxHash, signed)
  const command = `protx shared_dissolve ${proTxHash} ${member.shareIndex} ${fee ?? DEFAULT_DISSOLVE_FEE} false`

  const broadcast = useWrite(async () => await backend.chain.broadcastTransaction(signed.trim()))

  const submit = (): void => {
    broadcast.mutate(undefined, {
      onSuccess: () => {
        notify('Dissolution broadcast. Refunds arrive when it confirms.')
        onOpenChange(false)
      },
      onError: e => notify(errorMessage(e), 'error')
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title='Dissolve this masternode'
      maxWidth='xl'
      horizontalMargin={12}
      className='max-h-[92dvh] overflow-y-auto !rounded-3xl dark:!border-line dark:!bg-surface'
    >
      <div className='flex flex-col gap-5'>
        <p className='text-small text-muted'>
          Dissolving ends the masternode for everyone: every member gets their principal back to their refund
          address. You don’t need anyone’s permission.
        </p>

        {preview.early
          ? (
            <Notice tone='warning' title={`Early exit: you pay ${formatDash(preview.penalty)}`}>
              The pool is still in its early period. The penalty is split between the other members. It becomes
              free in about {blocksToDuration(preview.blocksUntilPenaltyFree)} ({preview.blocksUntilPenaltyFree.toLocaleString('en-US')} blocks).
            </Notice>
            )
          : <Notice tone='success' title='No penalty'>The early period is over.</Notice>}

        <Field label='Network fee' error={feeError} hint='Paid from your share' htmlFor='dissolve-fee'>
          <Input id='dissolve-fee' inputMode='decimal' value={feeText} onChange={e => setFeeText(e.target.value)} prefix='DASH' />
        </Field>

        <div>
          <div className='mb-2 text-small font-bold'>Refunds</div>
          <ul className='divide-y divide-line/70 rounded-2xl bg-surface-2 px-4'>
            {state.members.map((m, i) => (
              <li key={m.join.id} className='flex items-center justify-between gap-3 py-2.5 text-small'>
                <IdentityChip id={m.join.ownerId} size='sm' suffix={i === member.shareIndex ? <span className='text-muted'>(you)</span> : null} />
                <span className='font-bold'>{formatDash(preview.refunds[i])}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className='mb-1.5 flex items-center justify-between'>
            <span className='text-small font-bold'>Sign in your wallet (Dash Core console)</span>
            <CopyButton text={command} aria-label='Copy command' />
          </div>
          <CodeBlock className='max-h-20'>{command}</CodeBlock>
          <div className='mt-1.5 text-small text-muted'>Your wallet builds the transaction from on-chain data and signs it with your share owner key for masternode {shortId(proTxHash, 8)}.</div>
        </div>

        <div>
          <label className='mb-1.5 block text-small font-bold' htmlFor='dissolve-signed'>Paste the signed transaction</label>
          <Textarea
            id='dissolve-signed'
            rows={4}
            value={signed}
            onChange={setSigned}
            font='grotesque'
            placeholder='Signed ProDisTx hex'
            error={signed.trim() !== '' && !signedValid}
            success={signedValid}
          />
          {signed.trim() !== '' && !signedValid && <div className='mt-1.5 text-small text-red-ink'>This is not a signed dissolution of this masternode</div>}
        </div>

        <div className='flex flex-wrap items-center gap-3'>
          <Button colorScheme='red' size='md' disabled={!signedValid || feeError != null || broadcast.isPending} onClick={submit}>
            {broadcast.isPending ? 'Broadcasting…' : 'Broadcast dissolution'}
          </Button>
          {backend.mode === 'mock' && (
            <button type='button' onClick={() => setSigned(mockDissolutionHex(proTxHash, member.shareIndex))} className='text-small font-bold text-brand-ink hover:underline'>
              Fill with mock data
            </button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
