import { CopyButton, Dialog, Input, Textarea } from 'dash-ui-kit/react'
import { Button } from './Button'
import { useState, type ReactNode } from 'react'
import { backend } from '../data'
import { mockDissolutionHex } from '../data/mock/mockTxBuilder'
import type { MemberState, PoolState } from '../data/queries'
import { useWrite } from '../hooks/data'
import { DEFAULT_DISSOLVE_FEE, MAX_DISSOLVE_FEE } from '../lib/consensus'
import type { DissolutionContext, DissolutionVerdict } from '../lib/dissolution'
import { blocksToDuration, formatDash, parseDash, shortId } from '../lib/format'
import { markDissolutionBroadcast } from '../lib/pendingDissolution'
import { previewUnilateralDissolve } from '../lib/rules'
import { signDissolutionWithKey } from '../lib/signDissolution'
import { IdentityChip } from './bits'
import { errorMessage, useToast } from './Toast'
import { Chip, CodeBlock, Field, Notice } from './ui'

type Method = 'core' | 'wallet' | 'key'

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
  const [method, setMethod] = useState<Method>('core')
  const [privateKey, setPrivateKey] = useState('')
  const proTxHash = state.finalTx?.txid ?? ''

  const fee = parseDash(feeText)
  const feeError = fee == null ? 'Enter a fee' : fee <= 0 || fee > MAX_DISSOLVE_FEE ? `Between 0 and ${formatDash(MAX_DISSOLVE_FEE)} (consensus limit)` : null
  const preview = previewUnilateralDissolve(
    state.members.map(m => m.join.amount), member.shareIndex, state.pool.earlyPeriodBlocks, state.pool.earlyPenalty,
    state.registeredHeight ?? state.height, state.height, fee ?? DEFAULT_DISSOLVE_FEE
  )
  const context: DissolutionContext = {
    proTxHash,
    collateralIndex: state.registration?.collateralIndex ?? 0,
    members: state.members.map(m => m.join),
    earlyPeriodBlocks: state.pool.earlyPeriodBlocks,
    earlyPenalty: state.pool.earlyPenalty,
    registeredHeight: state.registeredHeight,
    height: state.height
  }
  const verdict = checkDissolution(context, signed)
  const signedValid = verdict?.ok === true
  const command = `protx shared_dissolve ${proTxHash} ${member.shareIndex} ${fee ?? DEFAULT_DISSOLVE_FEE} false`

  const signWithKey = (): void => {
    if (fee == null) return
    const result = signDissolutionWithKey(context, member.shareIndex, fee, privateKey)
    if (!result.ok) {
      notify(result.error, 'error')
      return
    }
    setSigned(result.hex)
    setPrivateKey('')
    notify('Signed with your private key. Review the transaction below, then broadcast it.')
  }

  const broadcast = useWrite(async () => await backend.chain.broadcastTransaction(signed.trim()))

  const submit = (): void => {
    broadcast.mutate(undefined, {
      onSuccess: txid => {
        // Remember it: the chainlocked list keeps showing the masternode for a while, and the pool
        // must not invite a second dissolution in the meantime
        markDissolutionBroadcast(state.pool.id, txid)
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
          <span className='text-small font-bold'>How do you want to sign?</span>
          <div className='mt-2 flex flex-wrap gap-2'>
            <Chip active={method === 'core'} onClick={() => setMethod('core')}>Dash Core</Chip>
            <Chip active={method === 'wallet'} onClick={() => setMethod('wallet')}>Dash Desktop Wallet</Chip>
            <Chip active={method === 'key'} onClick={() => setMethod('key')}>Private key</Chip>
          </div>
        </div>

        {method === 'core' && (
          <div>
            <div className='mb-1.5 flex items-center justify-between'>
              <span className='text-small font-bold'>Sign in the Dash Core console</span>
              <CopyButton text={command} aria-label='Copy command' />
            </div>
            <CodeBlock className='max-h-20'>{command}</CodeBlock>
            <div className='mt-1.5 text-small text-muted'>Your wallet builds the transaction from on-chain data and signs it with your share owner key for masternode {shortId(proTxHash, 8)}.</div>
          </div>
        )}

        {method === 'wallet' && (
          <Notice tone='info' title='Signing from Dash Desktop Wallet'>
            This is not wired yet. Once the wallet can build a shared-masternode dissolution it will be a one-click
            link from here. For now, sign in Dash Core or paste your private key and sign here — then broadcast below.
          </Notice>
        )}

        {method === 'key' && (
          <Field
            label='Your share owner private key'
            htmlFor='dissolve-private-key'
            hint='WIF or 64-character hex. Used in this tab only: never stored, never sent, cleared after signing.'
          >
            <div className='mb-2 rounded-xl bg-surface-2 px-3 py-2 text-small'>
              <span className='text-muted'>Signing key for </span>
              <span className='font-mono break-all'>{member.join.ownerAddress}</span>
              <CopyButton text={member.join.ownerAddress} aria-label='Copy signing address' />
            </div>
            <Input
              id='dissolve-private-key'
              type='password'
              autoComplete='off'
              spellCheck={false}
              value={privateKey}
              onChange={e => setPrivateKey(e.target.value)}
              placeholder='WIF or hex private key'
            />
            <div className='mt-2'>
              <Button colorScheme='brand' size='md' disabled={privateKey.trim() === '' || fee == null} onClick={signWithKey}>
                Sign the dissolution
              </Button>
            </div>
          </Field>
        )}

        <div>
          <label className='mb-1.5 block text-small font-bold' htmlFor='dissolve-signed'>Paste the signed transaction</label>
          <Textarea
            id='dissolve-signed'
            rows={4}
            value={signed}
            onChange={setSigned}
            font='grotesque'
            placeholder='Signed ProDisTx hex'
            error={verdict != null && !verdict.ok}
            success={signedValid}
          />
          {signedValid && <div className='mt-1.5 text-small text-mint-ink'>Valid unilateral dissolution of this masternode</div>}
          {verdict != null && !verdict.ok && (
            <ul className='mt-1.5 flex flex-col gap-1 text-small text-red-ink'>
              {verdict.findings.map(f => <li key={f}>{f}</li>)}
            </ul>
          )}
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

/** Verification must never take the dialog down with it: a throw becomes a finding */
function checkDissolution (ctx: DissolutionContext, signedHex: string): DissolutionVerdict | null {
  if (signedHex.trim() === '') return null
  try {
    return backend.tx.verifyDissolution(ctx, signedHex)
  } catch (e) {
    return { ok: false, findings: [errorMessage(e)] }
  }
}
