import { Dialog, Input } from 'dash-ui-kit/react'
import { Button } from './Button'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { backend } from '../data'
import { mockRegisterOutput } from '../data/mock/mockBackend'
import { randomBase58, randomHex, seededRandom } from '../data/mock/mockHash'
import { useWrite } from '../hooks/data'
import { COLLATERAL, MAX_SHARES, MIN_SHARES } from '../lib/consensus'
import { formatBasisPoints, formatDash, parseDash } from '../lib/format'
import { isTxid, rewardSharePercent, validateJoinInput, type JoinInput } from '../lib/rules'
import { useNetwork } from '../lib/network'
import type { Duffs, Outpoint, Pool } from '../lib/types'
import { useWallet } from '../wallet/WalletContext'
import { errorMessage, useToast } from './Toast'
import { Chip, Field, Notice } from './ui'

interface Props {
  pool: Pool
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** "txid:vout" → Outpoint */
export function parseOutpoint (value: string): Outpoint | null {
  const [txid, vout] = value.trim().split(':')
  if (txid == null || vout == null || !isTxid(txid) || !/^\d+$/.test(vout)) return null
  return { txid: txid.toLowerCase(), vout: Number(vout) }
}

export function JoinDialog ({ pool, open, onOpenChange }: Props): ReactNode {
  const { activeIdentity } = useWallet()
  const { network, strict } = useNetwork()
  const { notify } = useToast()
  const [amountText, setAmountText] = useState('')
  const [fields, setFields] = useState({ ownerAddress: '', refundAddress: '', rewardAddress: '', changeAddress: '' })
  const [utxos, setUtxos] = useState<string[]>([''])
  const [touched, setTouched] = useState(false)
  // undefined = not chosen yet (defaults to the identity's first key); null = join without the private chat
  const [chatKeyChoice, setChatKeyChoice] = useState<number | null | undefined>(undefined)

  // Identity keys the private chat key can be encrypted to. They're public on Platform.
  const encryptionKeys = useQuery({
    queryKey: ['encryption-keys', activeIdentity],
    queryFn: async () => await backend.platform.getEncryptionKeys(activeIdentity as string),
    enabled: activeIdentity != null && open
  })
  const encryptionKeyId = chatKeyChoice === undefined ? encryptionKeys.data?.[0]?.id ?? null : chatKeyChoice

  const amount = parseDash(amountText)
  const input: JoinInput = { amount, ...fields }
  const errors = validateJoinInput(input, pool, network, strict)
  const outpoints = utxos.map(parseOutpoint)

  // Input values come from the chain (DAPI getTransaction of each funding tx)
  const values = useQuery({
    queryKey: ['outputs', outpoints.map(o => o == null ? '' : `${o.txid}:${o.vout}`)],
    queryFn: async () => await Promise.all(outpoints.map(async o => o == null ? null : await backend.chain.getOutputValue(o))),
    enabled: outpoints.some(o => o != null)
  })
  const knownTotal = (values.data ?? []).reduce<number>((s, v) => s + (v ?? 0), 0)
  // The fee share depends on how many members the creator selects; plan for the largest share (2 members).
  // When the creator pays, members reserve nothing for it.
  const creatorPays = pool.feePayer === 'creator'
  const maxFeeShare = creatorPays ? 0 : Math.ceil(pool.fee / MIN_SHARES)
  const minFeeShare = creatorPays ? 0 : Math.floor(pool.fee / MAX_SHARES)
  const needed = (amount ?? 0) + maxFeeShare
  const utxoProblem = outpoints.some(o => o == null)
    ? 'Enter each UTXO as txid:vout'
    : values.data?.some(v => v == null) === true
      ? 'A UTXO was not found on chain'
      : values.data != null && knownTotal < needed
        ? `UTXOs total ${formatDash(knownTotal)}, need at least ${formatDash(needed)}`
        : null
  const duplicate = new Set(outpoints.filter(o => o != null).map(o => `${o.txid}:${o.vout}`)).size < outpoints.filter(o => o != null).length

  const valid = Object.keys(errors).length === 0 && utxoProblem == null && !duplicate && values.data != null

  const join = useWrite(async () => {
    if (activeIdentity == null) throw new Error('Connect your identity first')
    return await backend.platform.createJoin(activeIdentity, {
      poolId: pool.id,
      amount: amount as Duffs,
      ownerAddress: fields.ownerAddress.trim(),
      refundAddress: fields.refundAddress.trim(),
      // Optional contract fields are left out, never sent as undefined/null
      ...(fields.rewardAddress.trim() === '' ? {} : { rewardAddress: fields.rewardAddress.trim() }),
      inputs: outpoints.filter((o): o is Outpoint => o != null),
      changeAddress: fields.changeAddress.trim(),
      ...(encryptionKeyId == null ? {} : { encryptionKeyId })
    })
  })

  const submit = (): void => {
    setTouched(true)
    if (!valid) return
    join.mutate(undefined, {
      onSuccess: () => {
        notify('You joined the pool')
        onOpenChange(false)
      },
      onError: e => notify(errorMessage(e), 'error')
    })
  }

  const fillMock = (): void => {
    const random = seededRandom(Date.now() % 2 ** 31)
    const address = (): string => randomBase58(random, 34, 'y')
    setAmountText('200')
    setFields({ ownerAddress: address(), refundAddress: address(), rewardAddress: '', changeAddress: address() })
    const txid = randomHex(random, 32)
    mockRegisterOutput({ txid, vout: 0 }, 200 * 1e8 + pool.fee)
    setUtxos([`${txid}:0`])
  }

  const show = (key: keyof typeof errors): string | null => touched ? errors[key] ?? null : null
  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields(f => ({ ...f, [key]: e.target.value }))

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Join ${pool.name}`}
      maxWidth='xl'
      horizontalMargin={12}
      className='max-h-[92dvh] overflow-y-auto !rounded-[20px] !border-0 !bg-surface dark:!bg-surface'
    >
      <div className='flex flex-col gap-5'>
        <p className='text-small text-muted'>
          Joining is final: you cannot change or withdraw a join. Your coins stay in your wallet until every
          selected member has signed and the masternode registers.
        </p>

        <Field label='Amount' error={show('amount')} hint={amount != null && amount <= COLLATERAL ? `${rewardSharePercent(amount, pool.operatorReward).toFixed(2)}% of the masternode rewards (after the ${formatBasisPoints(pool.operatorReward)} operator fee)` : '100 to 1000 DASH'} htmlFor='join-amount'>
          <Input id='join-amount' inputMode='decimal' placeholder='250' value={amountText} onChange={e => setAmountText(e.target.value)} prefix='DASH' />
        </Field>

        <Field label='Share owner address' error={show('ownerAddress')} hint='A new P2PKH address from your wallet. Its key signs your consent and, later, a dissolution.' htmlFor='join-owner'>
          <Input id='join-owner' value={fields.ownerAddress} onChange={set('ownerAddress')} placeholder='y…' spellCheck={false} />
        </Field>

        <Field label='Refund address' error={show('refundAddress')} hint='Where your principal returns when the masternode dissolves. It can never change.' htmlFor='join-refund'>
          <Input id='join-refund' value={fields.refundAddress} onChange={set('refundAddress')} placeholder='y… (a cold wallet is a good choice)' spellCheck={false} />
        </Field>

        <Field label='Reward address' optional error={show('rewardAddress')} hint='Where your share of the rewards goes. Defaults to the refund address.' htmlFor='join-reward'>
          <Input id='join-reward' value={fields.rewardAddress} onChange={set('rewardAddress')} placeholder='y…' spellCheck={false} />
        </Field>

        <div className='flex flex-col gap-2'>
          <span className='text-small font-bold'>Your UTXOs</span>
          {utxos.map((value, i) => (
            <div key={i} className='flex gap-2'>
              <div className='min-w-0 flex-1'>
                <Input
                  value={value}
                  onChange={e => setUtxos(list => list.map((v, k) => k === i ? e.target.value : v))}
                  placeholder='txid:vout'
                  spellCheck={false}
                  aria-label={`UTXO ${i + 1}`}
                  className='w-full font-mono text-small'
                />
              </div>
              <span className='w-24 shrink-0 sm:w-32 self-center text-right text-small text-muted'>
                {outpoints[i] == null ? '' : values.data?.[i] == null ? (values.isFetching ? '…' : 'not found') : formatDash(values.data[i] as number)}
              </span>
              {utxos.length > 1 && (
                <button type='button' onClick={() => setUtxos(list => list.filter((_, k) => k !== i))} className='px-2 text-muted hover:text-red-ink' aria-label={`Remove UTXO ${i + 1}`}>✕</button>
              )}
            </div>
          ))}
          <button type='button' onClick={() => setUtxos(list => [...list, ''])} className='self-start text-small font-bold text-brand-ink hover:underline'>+ Add UTXO</button>
          <div className='text-small text-muted'>
            {creatorPays
              ? `They only need to cover your amount; the pool creator pays the ${formatDash(pool.fee)} registration fee.`
              : `They must cover your amount plus your share of the ${formatDash(pool.fee)} fee (${formatDash(minFeeShare)} to ${formatDash(maxFeeShare)} depending on the member count).`}
            {' '}Don’t spend them until the pool registers.
          </div>
          {touched && (utxoProblem != null || duplicate) && <div className='text-small text-red-ink'>{duplicate ? 'The same UTXO is listed twice' : utxoProblem}</div>}
        </div>

        <Field label='Change address' error={show('changeAddress')} hint={creatorPays ? 'Receives whatever your UTXOs hold beyond your amount.' : 'Receives whatever your UTXOs hold beyond your amount and fee.'} htmlFor='join-change'>
          <Input id='join-change' value={fields.changeAddress} onChange={set('changeAddress')} placeholder='y…' spellCheck={false} />
        </Field>

        <Field
          label='Private chat'
          hint={encryptionKeys.data != null && encryptionKeys.data.length > 0
            ? 'Selected members get an encrypted chat. Its key is locked to this key on your identity, so only you can open your copy. This can’t be changed after joining.'
            : undefined}
        >
          {encryptionKeys.data == null
            ? <span className='text-small text-muted'>Checking your identity’s keys…</span>
            : encryptionKeys.data.length === 0
              ? (
                <Notice tone='warning' title='Your identity has no encryption key'>
                  You can still join, but you won’t be able to read this pool’s private chat. To take part, add an
                  encryption key to your identity before joining: a join can’t be changed later.
                </Notice>
                )
              : (
                <div className='flex flex-wrap gap-2'>
                  {encryptionKeys.data.map(key => (
                    <Chip key={key.id} active={encryptionKeyId === key.id} onClick={() => setChatKeyChoice(key.id)}>Identity key #{key.id}</Chip>
                  ))}
                  <Chip active={encryptionKeyId == null} onClick={() => setChatKeyChoice(null)}>Don’t take part</Chip>
                </div>
                )}
        </Field>

        {pool.earlyPenalty === 0 && (
          <Notice tone='warning' title='This pool has no early exit penalty'>
            Any member can dissolve the masternode at any time, at no cost beyond the fee.
          </Notice>
        )}

        <div className='sticky bottom-0 -mx-6 flex flex-wrap items-center gap-3 border-t border-line/70 bg-surface px-6 pt-3 pb-1'>
          <Button colorScheme='brand' size='md' onClick={submit} disabled={join.isPending || activeIdentity == null}>
            {join.isPending ? 'Publishing…' : 'Join pool'}
          </Button>
          {backend.mode === 'mock' && (
            <button type='button' onClick={fillMock} className='text-small font-bold text-brand-ink hover:underline'>Fill with mock data</button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
