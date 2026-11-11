import { CopyButton, Input, Textarea } from 'dash-ui-kit/react'
import { Button } from './Button'
import { useMemo, useState, type ReactNode } from 'react'
import { backend } from '../data'
import { mockSignature } from '../data/mock/mockHash'
import { mockSignedFundingHex } from '../data/mock/mockTxBuilder'
import type { MemberState, PoolState } from '../data/queries'
import { useWrite } from '../hooks/data'
import { blocksToDuration, formatBasisPoints, formatDash } from '../lib/format'
import { signConsentWithKey } from '../lib/signConsent'
import { signFeeInputsWithKeys, signFundingWithKeys } from '../lib/signFunding'
import { scriptToAddress } from '../lib/address'
import { fromHex } from '../lib/bytes'
import { useWallet } from '../wallet/WalletContext'
import { errorMessage, useToast } from './Toast'
import { Chip, CodeBlock, Field, KeyValue, KeyValueList, Notice } from './ui'

type Kind = 'consent' | 'funding'
type Method = 'core' | 'wallet' | 'key'

/**
 * Signing step for a lock member. The app never touches keys: it shows what to sign, the user
 * signs in their own wallet, pastes the result, and the app checks it before publishing.
 */
export function SignPanel ({ kind, state, member }: { kind: Kind, state: PoolState, member: MemberState }): ReactNode {
  const { activeIdentity } = useWallet()
  const { notify } = useToast()
  const [input, setInput] = useState('')
  const [method, setMethod] = useState<Method>('core')
  const [privateKey, setPrivateKey] = useState('')
  const registration = state.registration
  const lock = state.lock

  const txHex = useMemo(() => {
    if (registration == null) return ''
    if (kind === 'consent') return registration.unsignedHex
    return backend.tx.withJoinSignatures(registration, state.members.map(m => m.consent?.signature ?? ''))
  }, [kind, registration, state.members])

  const parsed = useMemo(() => {
    if (registration == null || input.trim() === '') return null
    return kind === 'consent'
      ? parseConsent(input, member.shareIndex, s => backend.tx.verifyConsent(registration, member.shareIndex, s))
      : parseFunding(input, h => backend.tx.extractScriptSigs(registration, member.shareIndex, h, txHex))
  }, [input, kind, registration, member.shareIndex])

  const publish = useWrite(async () => {
    if (activeIdentity == null || lock == null || parsed == null || !parsed.ok) throw new Error('Nothing to publish')
    if (kind === 'consent') {
      await backend.platform.createConsent(activeIdentity, { lockId: lock.id, signature: parsed.value as string })
    } else {
      await backend.platform.createFunding(activeIdentity, { lockId: lock.id, scriptSigs: parsed.value as string[] })
    }
  })

  if (registration == null || lock == null) return null
  const me = registration.members[member.shareIndex]
  const command = kind === 'consent' ? `protx shared_sign ${txHex}` : `signrawtransactionwithwallet ${txHex}`

  const submit = (): void => {
    publish.mutate(undefined, {
      onSuccess: () => {
        setInput('')
        notify(kind === 'consent' ? 'Consent published' : 'Funding signatures published')
      },
      onError: e => notify(errorMessage(e), 'error')
    })
  }

  const fillMock = (): void => {
    setInput(kind === 'consent'
      ? mockSignature(`${registration.consentHash}:${member.shareIndex}:${Date.now()}`)
      : mockSignedFundingHex(registration.consentHash, member.shareIndex))
  }

  const signWithPrivateKey = (): void => {
    if (kind === 'consent') {
      const result = signConsentWithKey(privateKey, registration.consentHash, me.join.ownerAddress)
      if (!result.ok) {
        notify(result.error, 'error')
        return
      }
      setInput(result.signature)
    } else {
      const result = signFundingWithKeys(
        txHex,
        state.members.map(m => m.join),
        member.shareIndex,
        [privateKey],
        state.prevouts
      )
      if (!result.ok) {
        notify(result.error, 'error')
        return
      }
      setInput(result.hex)
    }
    setPrivateKey('')
    notify(kind === 'consent'
      ? 'Signed with your private key. Review the signature below, then publish it.'
      : 'Signed your inputs. Review the transaction below, then publish it.')
  }

  // The funding key is the UTXO key, so name the addresses it has to control
  const fundingAddresses = kind !== 'funding'
    ? []
    : [...new Set(me.join.inputs.map(input => {
      const prevout = state.prevouts.get(`${input.txid}:${input.vout}`)
      return prevout == null ? null : scriptToAddress(fromHex(prevout.script), 'testnet')
    }).filter((address): address is string => address != null))]

  return (
    <div className='flex flex-col gap-5'>
      <div>
        <h3 className='text-lead font-extrabold tracking-[-0.02em]'>
          {kind === 'consent' ? 'Step 1 · Sign your consent' : 'Step 2 · Sign your coins'}
        </h3>
        <p className='mt-1 text-small text-muted'>
          {kind === 'consent'
            ? 'Your consent signature binds you to exactly this transaction: every input, every output, every share and the pool terms. It uses your share owner key.'
            : 'Every member has consented. Now sign the inputs you committed, so the transaction can spend them. Your wallet signs only your own inputs.'}
        </p>
      </div>

      <div className='rounded-2xl bg-surface-2 px-4'>
        <KeyValueList>
          <KeyValue label='Your share'>
            {formatDash(me.join.amount)} <span className='font-normal text-muted'>· share {member.shareIndex + 1} of {registration.members.length}</span>
          </KeyValue>
          <KeyValue label='Refund address (permanent)'><span className='font-mono text-small break-all'>{me.join.refundAddress}</span></KeyValue>
          <KeyValue label='Share owner address (the key you sign with)'>
            <span className='font-mono text-small break-all'>{me.join.ownerAddress}</span>
          </KeyValue>
          {me.join.rewardAddress != null && (
            <KeyValue label='Reward address'><span className='font-mono text-small break-all'>{me.join.rewardAddress}</span></KeyValue>
          )}
          <KeyValue label='Your fee share'>{formatDash(me.feeShare)}</KeyValue>
          <KeyValue label='Change back to you'>{me.change == null ? 'Unknown' : formatDash(me.change)}</KeyValue>
          <KeyValue label='Operator fee'>{formatBasisPoints(state.pool.operatorReward)}</KeyValue>
          <KeyValue label='Early exit'>
            {state.pool.earlyPenalty === 0 ? 'Free' : `${formatDash(state.pool.earlyPenalty)} for ${blocksToDuration(state.pool.earlyPeriodBlocks)}`}
          </KeyValue>
          {kind === 'consent' && (
            <KeyValue label='Consent hash'><span className='font-mono text-[12px] break-all'>{registration.consentHash}</span></KeyValue>
          )}
        </KeyValueList>
      </div>

      <Notice tone='info' title='Check this in your wallet, not here'>
        Your wallet decodes the transaction itself and shows the same terms. Sign only if they match.
      </Notice>

      <div>
        <span className='text-small font-bold'>How do you want to sign?</span>
        <div className='mt-2 flex flex-wrap gap-2'>
          <Chip active={method === 'core'} onClick={() => setMethod('core')}>Dash Core</Chip>
          <Chip active={method === 'wallet'} onClick={() => setMethod('wallet')}>Dash Desktop Wallet</Chip>
          <Chip active={method === 'key'} onClick={() => setMethod('key')}>Private key</Chip>
        </div>
      </div>

      <div>
        <div className='mb-1.5 flex items-center justify-between'>
          <span className='text-small font-bold'>Transaction to sign</span>
          <CopyButton text={txHex} aria-label='Copy transaction hex' />
        </div>
        <CodeBlock>{txHex}</CodeBlock>
      </div>

      {(kind === 'funding' || method === 'core') && (
        <div>
          <div className='mb-1.5 flex items-center justify-between'>
            <span className='text-small font-bold'>Or in the Dash Core console</span>
            <CopyButton text={command} aria-label='Copy command' />
          </div>
          <CodeBlock className='max-h-20'>{command}</CodeBlock>
        </div>
      )}

      {method === 'wallet' && (
        <Notice tone='info' title='Signing from Dash Desktop Wallet'>
          This is not wired yet. Once the wallet can sign {kind === 'consent' ? 'a consent digest' : 'transaction inputs'} it
          will be a one-click link from here. For now, sign in the wallet or in Dash Core and paste the result below.
        </Notice>
      )}

      {method === 'key' && (
        <Field
          label={kind === 'consent' ? 'Your share owner private key' : 'Private key of the addresses you funded with'}
          htmlFor='consent-private-key'
          hint={kind === 'consent'
            ? `Private key of ${me.join.ownerAddress} — the owner of your share. WIF or 64-character hex. Used in this tab only: never stored, never sent, cleared after signing.`
            : `One WIF or 64-character hex key per funded address, separated by commas or newlines. Used in this tab only: never stored, never sent, cleared after signing.`}
        >
          <div className='mb-2 rounded-xl bg-surface-2 px-3 py-2 text-small'>
            <span className='text-muted'>{kind === 'consent' ? 'Signing key for ' : 'Must control '}</span>
            {kind === 'consent'
              ? <span className='font-mono break-all'>{me.join.ownerAddress}</span>
              : <span className='font-mono break-all'>{fundingAddresses.join(', ') || 'the addresses of your committed inputs'}</span>}
            <CopyButton
              text={kind === 'consent' ? me.join.ownerAddress : fundingAddresses.join('\n')}
              aria-label='Copy signing address'
            />
          </div>
          <Input
            id='consent-private-key'
            type='password'
            autoComplete='off'
            spellCheck={false}
            value={privateKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrivateKey(e.target.value)}
            placeholder={kind === 'consent' ? 'WIF or hex private key' : 'WIF or hex keys, comma separated'}
          />
          <div className='mt-2'>
            <Button colorScheme='brand' size='md' disabled={privateKey.trim() === ''} onClick={signWithPrivateKey}>
              {kind === 'consent' ? 'Sign with this key' : 'Sign my inputs'}
            </Button>
          </div>
        </Field>
      )}

      <div>
        <label className='mb-1.5 block text-small font-bold' htmlFor={`sign-${kind}`}>
          {kind === 'consent' ? 'Paste the signature' : 'Paste the signed transaction'}
        </label>
        <Textarea
          id={`sign-${kind}`}
          rows={4}
          value={input}
          onChange={setInput}
          font='grotesque'
          placeholder={kind === 'consent' ? 'Signature or shared_sign output' : 'Signed transaction hex'}
          error={parsed != null && !parsed.ok}
          success={parsed?.ok === true}
        />
        {parsed != null && (
          <div className={parsed.ok ? 'mt-1.5 text-small text-mint-ink' : 'mt-1.5 text-small text-red-ink'}>
            {parsed.ok ? (kind === 'consent' ? 'Valid signature for your share owner key' : 'Valid signatures for your inputs') : parsed.error}
          </div>
        )}
      </div>

      <div className='flex flex-wrap items-center gap-3'>
        <Button colorScheme='brand' size='md' disabled={parsed?.ok !== true || publish.isPending} onClick={submit}>
          {publish.isPending ? 'Publishing…' : kind === 'consent' ? 'Publish consent' : 'Publish signatures'}
        </Button>
        {backend.mode === 'mock' && (
          <button type='button' onClick={fillMock} className='text-small font-bold text-brand-ink hover:underline'>
            Fill with mock data
          </button>
        )}
      </div>
    </div>
  )
}

type Parsed = { ok: true, value: string | string[] } | { ok: false, error: string }

function tryJson (value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/** Accepts a bare base64 signature or the JSON result of `protx shared_sign` */
function parseConsent (input: string, shareIndex: number, verify: (sig: string) => boolean): Parsed {
  let signature = input.trim()
  const json = tryJson(signature) as { signatures?: Array<{ shareIndex: number, signature: string }> } | null
  if (json?.signatures != null) {
    const mine = json.signatures.find(s => s.shareIndex === shareIndex)
    if (mine == null) return { ok: false, error: `The output has no signature for share ${shareIndex + 1}. Is this the wallet that holds your owner key?` }
    signature = mine.signature
  }
  return verify(signature)
    ? { ok: true, value: signature }
    : { ok: false, error: 'This is not a valid signature by your share owner key over this transaction' }
}

/** Accepts signed hex or the JSON result of `signrawtransactionwithwallet` */
function parseFunding (input: string, extract: (hex: string) => string[] | null): Parsed {
  let hex = input.trim()
  const json = tryJson(hex) as { hex?: string } | null
  if (json?.hex != null) hex = json.hex
  const scriptSigs = extract(hex)
  return scriptSigs == null
    ? { ok: false, error: 'Could not find valid signatures for your inputs in this transaction' }
    : { ok: true, value: scriptSigs }
}

/**
 * The creator-paid registration fee. The fee inputs are already in the lock, so the transaction the
 * creator signs is the same joined tx members sign; the app only extracts the fee inputs' scriptSigs.
 */
export function FeeFundingPanel ({ state }: { state: PoolState }): ReactNode {
  const { activeIdentity } = useWallet()
  const { notify } = useToast()
  const [input, setInput] = useState('')
  const [method, setMethod] = useState<'core' | 'key'>('core')
  const [privateKey, setPrivateKey] = useState('')
  const registration = state.registration
  const lock = state.lock

  const joinedHex = useMemo(() => {
    if (registration == null) return ''
    return backend.tx.withJoinSignatures(registration, state.members.map(m => m.consent?.signature ?? ''))
  }, [registration, state.members])

  const feeInputs = registration?.feeInputs ?? []
  const parsed = useMemo((): Parsed | null => {
    if (registration == null || input.trim() === '') return null
    let hex = input.trim()
    const json = tryJson(hex) as { hex?: string } | null
    if (json?.hex != null) hex = json.hex
    const scriptSigs = backend.tx.extractFeeScriptSigs(registration, hex, joinedHex)
    if (scriptSigs == null) return { ok: false, error: 'Could not find the creator fee signatures in this transaction' }
    return backend.tx.verifyFeeScriptSigs(registration, scriptSigs, state.prevouts, joinedHex)
      ? { ok: true, value: scriptSigs }
      : { ok: false, error: 'The fee input signatures do not verify against this transaction' }
  }, [input, registration, joinedHex, state.prevouts])

  const publish = useWrite(async () => {
    if (activeIdentity == null || lock == null || parsed == null || !parsed.ok) throw new Error('Nothing to publish')
    await backend.platform.createFeeFunding(activeIdentity, { lockId: lock.id, scriptSigs: parsed.value as string[] })
  })

  if (registration == null || lock == null) return null

  const feeAddresses = [...new Set(feeInputs.map(outpoint => {
    const prevout = state.prevouts.get(`${outpoint.txid}:${outpoint.vout}`)
    return prevout == null ? null : scriptToAddress(fromHex(prevout.script), 'testnet')
  }).filter((address): address is string => address != null))]

  const command = `signrawtransactionwithwallet ${joinedHex}`

  const submit = (): void => {
    publish.mutate(undefined, {
      onSuccess: () => {
        setInput('')
        notify('Creator fee signatures published')
      },
      onError: e => notify(errorMessage(e), 'error')
    })
  }

  const signWithKey = (): void => {
    const result = signFeeInputsWithKeys(joinedHex, state.members.map(m => m.join), feeInputs, [privateKey], state.prevouts)
    if (!result.ok) {
      notify(result.error, 'error')
      return
    }
    setInput(result.hex)
    setPrivateKey('')
    notify('Signed the fee input. Review the transaction, then publish it.')
  }

  return (
    <div className='flex flex-col gap-5 rounded-2xl border border-line p-4'>
      <div>
        <h3 className='text-lead font-extrabold tracking-[-0.02em]'>Registration fee · Sign your fee input</h3>
        <p className='mt-1 text-small text-muted'>
          You pay the {formatDash(state.pool.fee)} registration fee. Members’ fee shares are zero; sign the fee UTXO
          so the transaction can spend it. The transaction already contains every member’s input.
        </p>
      </div>

      <div className='rounded-2xl bg-surface-2 px-4'>
        <KeyValueList>
          <KeyValue label='Registration fee'>{formatDash(state.pool.fee)}</KeyValue>
          <KeyValue label='Fee input addresses (the keys you sign with)'>
            <span className='font-mono text-small break-all'>{feeAddresses.join(', ') || 'Unknown (input not found on chain)'}</span>
          </KeyValue>
          {lock.feeChangeAddress != null && (
            <KeyValue label='Change address'><span className='font-mono text-small break-all'>{lock.feeChangeAddress}</span></KeyValue>
          )}
        </KeyValueList>
      </div>

      <Notice tone='info' title='Sign only your fee input'>
        Your wallet decodes the transaction itself. Members already signed their own inputs; this signature only
        authorizes the fee UTXO you committed at lock.
      </Notice>

      <div>
        <span className='text-small font-bold'>How do you want to sign?</span>
        <div className='mt-2 flex flex-wrap gap-2'>
          <Chip active={method === 'core'} onClick={() => setMethod('core')}>Dash Core</Chip>
          <Chip active={method === 'key'} onClick={() => setMethod('key')}>Private key</Chip>
        </div>
      </div>

      <div>
        <div className='mb-1.5 flex items-center justify-between'>
          <span className='text-small font-bold'>Transaction to sign</span>
          <CopyButton text={joinedHex} aria-label='Copy transaction hex' />
        </div>
        <CodeBlock>{joinedHex}</CodeBlock>
        <div className='mt-2'>
          <div className='mb-1.5 flex items-center justify-between'>
            <span className='text-small font-bold'>Or in the Dash Core console</span>
            <CopyButton text={command} aria-label='Copy command' />
          </div>
          <CodeBlock className='max-h-20'>{command}</CodeBlock>
        </div>
      </div>

      {method === 'key' && (
        <Field
          label='Private key of the fee input addresses'
          htmlFor='fee-private-key'
          hint={`One WIF or 64-character hex key for ${feeAddresses.join(', ') || 'the fee input'}. Used in this tab only: never stored, never sent, cleared after signing.`}
        >
          <Input
            id='fee-private-key'
            type='password'
            autoComplete='off'
            spellCheck={false}
            value={privateKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrivateKey(e.target.value)}
            placeholder='WIF or hex private key'
          />
          <div className='mt-2'>
            <Button colorScheme='brand' size='md' disabled={privateKey.trim() === ''} onClick={signWithKey}>
              Sign the fee input
            </Button>
          </div>
        </Field>
      )}

      <div>
        <label className='mb-1.5 block text-small font-bold' htmlFor='fee-signed-tx'>Paste the signed transaction</label>
        <Textarea
          id='fee-signed-tx'
          rows={4}
          value={input}
          onChange={setInput}
          font='grotesque'
          placeholder='Signed transaction hex'
          error={parsed != null && !parsed.ok}
          success={parsed?.ok === true}
        />
        {parsed != null && (
          <div className={parsed.ok ? 'mt-1.5 text-small text-mint-ink' : 'mt-1.5 text-small text-red-ink'}>
            {parsed.ok ? 'Valid fee input signatures' : parsed.error}
          </div>
        )}
      </div>

      <div className='flex flex-wrap items-center gap-3'>
        <Button colorScheme='brand' size='md' disabled={parsed?.ok !== true || publish.isPending} onClick={submit}>
          {publish.isPending ? 'Publishing…' : 'Publish fee signatures'}
        </Button>
        {backend.mode === 'mock' && (
          <button type='button' onClick={() => setInput(mockSignedFundingHex(registration.consentHash, 99))} className='text-small font-bold text-brand-ink hover:underline'>
            Fill with mock data
          </button>
        )}
      </div>
    </div>
  )
}
