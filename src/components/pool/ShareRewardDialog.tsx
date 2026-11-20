import { Dialog, Input } from 'dash-ui-kit/react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { backend } from '../../data'
import type { MemberState, PoolState } from '../../data/queries'
import { useWrite } from '../../hooks/data'
import type { OnchainShares } from '../../lib/onchainShares'
import { checkSignedShareUpdate, rewardAddressProblem, shareUpdateCommand, signShareUpdate, type ShareUpdateCheck } from '../../lib/shareUpdate'
import { Button } from '../Button'
import { parseOutpoint } from '../JoinDialog'
import { errorMessage, useToast } from '../Toast'
import { Notice } from '../ui'

/**
 * ProUpShareTx, external path: the app never sees a key. It builds Core's `shared_update_share … false`
 * command, then preflights the signed hex Core returns before broadcasting it through DAPI.
 */
export function ShareRewardDialog ({ state, member, shares, onClose }: {
  state: PoolState
  member: MemberState
  shares: OnchainShares | null
  onClose: () => void
}): ReactNode {
  const { notify } = useToast()
  const queryClient = useQueryClient()
  const onchain = shares?.shares[member.shareIndex] ?? null
  const currentReward = onchain?.rewardAddress ?? onchain?.refundAddress ?? member.join.rewardAddress ?? member.join.refundAddress
  const proTxHash = state.finalTx?.txid ?? null

  const [reward, setReward] = useState(currentReward)
  const [feeSource, setFeeSource] = useState(member.join.ownerAddress)
  const [signedHex, setSignedHex] = useState('')
  const [check, setCheck] = useState<ShareUpdateCheck | null>(null)
  const [ownerKey, setOwnerKey] = useState('')
  const [feeKey, setFeeKey] = useState('')
  const [feeOutpoint, setFeeOutpoint] = useState('')
  const [feeAmount, setFeeAmount] = useState('20000')
  const [changeAddress, setChangeAddress] = useState('')

  const ownerAddresses = useMemo(() => shares?.shares.map(s => s.ownerAddress) ?? state.members.map(m => m.join.ownerAddress), [shares, state.members])
  const addressProblem = rewardAddressProblem(reward.trim(), { votingAddress: shares?.votingAddress ?? state.pool.votingAddress, ownerAddresses })

  const command = proTxHash == null
    ? ''
    : shareUpdateCommand({ proTxHash, shareIndex: member.shareIndex, rewardAddress: reward.trim(), feeSourceAddress: feeSource.trim() })

  const broadcast = useWrite(async () => {
    if (check == null || check.problems.length > 0 || check.txid == null) throw new Error('Check the signed transaction first')
    const txid = await backend.chain.broadcastTransaction(signedHex.trim())
    await queryClient.invalidateQueries({ queryKey: ['pool', state.pool.id] })
    await queryClient.invalidateQueries({ queryKey: ['onchain-shares', proTxHash] })
    return txid
  })

  const verify = (): void => {
    if (proTxHash == null) return
    setCheck(checkSignedShareUpdate(signedHex.trim(), { proTxHash, shareIndex: member.shareIndex, rewardAddress: reward.trim() }, onchain?.ownerAddress ?? member.join.ownerAddress, { votingAddress: shares?.votingAddress ?? state.pool.votingAddress, ownerAddresses }))
  }

  const signAndSend = useWrite(async () => {
    if (proTxHash == null) throw new Error('The pool has no registration transaction yet')
    const outpoint = parseOutpoint(feeOutpoint)
    if (outpoint == null) throw new Error('Enter the fee UTXO as txid:vout')
    const amount = Number(feeAmount)
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Enter the network fee in duffs')
    const prevout = await backend.chain.getPrevout(outpoint)
    if (prevout == null) throw new Error('Could not read that fee UTXO')
    const signed = signShareUpdate({
      proTxHash,
      shareIndex: member.shareIndex,
      rewardAddress: reward.trim(),
      shareOwnerAddress: onchain?.ownerAddress ?? member.join.ownerAddress,
      fee: { outpoint, prevout },
      feeAmount: amount,
      changeAddress,
      ownerKeyText: ownerKey,
      feeKeyText: feeKey
    })
    if (!signed.ok) throw new Error(signed.error)
    const txid = await backend.chain.broadcastTransaction(signed.hex)
    await queryClient.invalidateQueries({ queryKey: ['pool', state.pool.id] })
    await queryClient.invalidateQueries({ queryKey: ['onchain-shares', proTxHash] })
    return txid
  })

  const copy = (): void => {
    void navigator.clipboard.writeText(command).then(() => notify('Command copied'), () => notify('Could not copy', 'error'))
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }} title={`Reward address · share ${member.shareIndex + 1}`} maxWidth='md' horizontalMargin={12} className='!rounded-3xl dark:!border-line dark:!bg-surface'>
      <div className='flex flex-col gap-4 text-small'>
        <p className='text-muted'>
          Only this share’s owner key can change its reward address. Run Core’s command from the wallet that holds
          it, or sign here with the share owner key and a fee UTXO — either way the app preflights the result before
          broadcasting.
        </p>

        <label className='flex flex-col gap-1'>
          <span className='font-bold'>New reward address</span>
          <Input value={reward} onChange={e => { setReward(e.target.value); setCheck(null) }} placeholder='y…' spellCheck={false} />
          {addressProblem != null ? <span className='text-tag text-red-ink'>{addressProblem}</span> : <span className='text-tag text-muted'>Paid directly by Dash for this share. Use the refund address to reset rewards.</span>}
        </label>

        <label className='flex flex-col gap-1'>
          <span className='font-bold'>Fee source address</span>
          <Input value={feeSource} onChange={e => { setFeeSource(e.target.value); setCheck(null) }} placeholder='y…' spellCheck={false} />
          <span className='text-tag text-muted'>A Core wallet address that pays the network fee. Must be in the wallet you run the command from.</span>
        </label>

        <div className='flex flex-col gap-2'>
          <span className='font-bold'>1. Run this in your Core wallet</span>
          <pre className='overflow-x-auto rounded-2xl bg-surface-2 p-3 font-mono text-tag'>{command}</pre>
          <div className='flex flex-wrap gap-3'>
            <button type='button' className='font-bold text-brand-ink hover:underline' onClick={copy}>Copy command</button>
            {onchain != null && <span className='text-tag text-muted'>On chain: {onchain.rewardAddress ?? `${onchain.refundAddress ?? 'refund address'} (refund fallback)`}</span>}
          </div>
        </div>

        <label className='flex flex-col gap-1'>
          <span className='font-bold'>2. Paste the signed transaction</span>
          <textarea
            value={signedHex}
            onChange={e => { setSignedHex(e.target.value); setCheck(null) }}
            rows={4}
            spellCheck={false}
            placeholder='The `hex` returned by the command'
            className='w-full resize-y rounded-2xl border border-line/70 bg-surface px-3 py-2 font-mono text-tag text-ink outline-none focus:border-brand'
          />
        </label>

        {check != null && check.problems.length > 0 && (
          <Notice tone='warning' title='Not ready to broadcast'>{check.problems.join(' ')}</Notice>
        )}
        {check != null && check.problems.length === 0 && (
          <Notice tone='info' title='Checked'>
            Share {check.shareIndex ?? ''} will pay {check.rewardAddress ?? ''}. The signature matches the share owner key.
          </Notice>
        )}

        <div className='flex flex-wrap gap-3'>
          <Button colorScheme='brand' size='md' disabled={signedHex.trim() === '' || addressProblem != null} onClick={verify}>Check</Button>
          <Button
            colorScheme='brand'
            size='md'
            disabled={check == null || check.problems.length > 0 || broadcast.isPending}
            onClick={() => broadcast.mutate(undefined, {
              onSuccess: txid => { notify(`Reward update broadcast: ${txid.slice(0, 12)}…`); onClose() },
              onError: e => notify(errorMessage(e), 'error')
            })}
          >
            {broadcast.isPending ? 'Broadcasting…' : 'Broadcast'}
          </Button>
        </div>

        <div className='flex items-center gap-3 text-tag text-muted'>
          <span className='h-px flex-1 bg-line/60' aria-hidden />
          <span>or sign in the browser</span>
          <span className='h-px flex-1 bg-line/60' aria-hidden />
        </div>

        <div className='flex flex-col gap-3'>
          <label className='flex flex-col gap-1'>
            <span className='font-bold'>Share owner private key</span>
            <Input
              value={ownerKey}
              onChange={e => setOwnerKey(e.target.value)}
              placeholder='WIF or 64-character hex'
              type='password'
              autoComplete='off'
              spellCheck={false}
            />
            <span className='text-tag text-muted'>Must control {onchain?.ownerAddress ?? member.join.ownerAddress}. It stays in this tab and is never stored.</span>
          </label>

          <label className='flex flex-col gap-1'>
            <span className='font-bold'>Fee UTXO</span>
            <Input value={feeOutpoint} onChange={e => setFeeOutpoint(e.target.value)} placeholder='txid:vout' spellCheck={false} />
          </label>

          <div className='grid grid-cols-2 gap-3'>
            <label className='flex flex-col gap-1'>
              <span className='font-bold'>Fee (duffs)</span>
              <Input value={feeAmount} onChange={e => setFeeAmount(e.target.value)} inputMode='numeric' />
            </label>
            <label className='flex flex-col gap-1'>
              <span className='font-bold'>Change address</span>
              <Input value={changeAddress} onChange={e => setChangeAddress(e.target.value)} placeholder='y…' spellCheck={false} />
            </label>
          </div>

          <label className='flex flex-col gap-1'>
            <span className='font-bold'>Fee input private key</span>
            <Input
              value={feeKey}
              onChange={e => setFeeKey(e.target.value)}
              placeholder='WIF or 64-character hex'
              type='password'
              autoComplete='off'
              spellCheck={false}
            />
          </label>

          <Button
            colorScheme='brand'
            size='md'
            disabled={addressProblem != null || signAndSend.isPending}
            onClick={() => signAndSend.mutate(undefined, {
              onSuccess: txid => { notify(`Reward update broadcast: ${txid.slice(0, 12)}…`); onClose() },
              onError: e => notify(errorMessage(e), 'error')
            })}
          >
            {signAndSend.isPending ? 'Signing…' : 'Sign and broadcast'}
          </Button>
          <span className='text-tag text-muted'>Signs the payload and the fee input in this tab. Testnet only for now.</span>
        </div>
      </div>
    </Dialog>
  )
}