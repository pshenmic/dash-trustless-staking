import { Textarea } from 'dash-ui-kit/react'
import { Button } from '../Button'
import { useState, type ReactNode } from 'react'
import { backend } from '../../data'
import { eligibleFeedback, type PoolState } from '../../data/queries'
import { useFeedback, useWrite } from '../../hooks/data'
import { relativeTime } from '../../lib/format'
import { useWallet } from '../../wallet/WalletContext'
import { IdentityChip } from '../bits'
import { errorMessage, useToast } from '../Toast'
import { cn, EmptyState, Loading, Stars } from '../ui'
import { poolRole } from './role'

export function FeedbackTab ({ state }: { state: PoolState }): ReactNode {
  const { data, isLoading } = useFeedback(state.pool.id)
  const { activeIdentity } = useWallet()
  const role = poolRole(state, activeIdentity)
  const feedback = eligibleFeedback(state, data ?? [])
  const formed = ['REGISTERED', 'FORMED', 'ERROR', 'DISSOLVED'].includes(state.status)
  const canWrite = formed && role.myMember != null && !feedback.some(f => f.ownerId === activeIdentity)
  const average = feedback.length > 0 ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : null

  if (isLoading) return <Loading />

  return (
    <div className='flex flex-col gap-6'>
      {average != null && (
        <div className='flex items-center gap-3'>
          <span className='text-[32px] leading-none font-extrabold tracking-[-0.03em]'>{average.toFixed(1)}</span>
          <div>
            <Stars value={average} />
            <div className='text-tag text-muted'>{feedback.length} member review{feedback.length === 1 ? '' : 's'}</div>
          </div>
        </div>
      )}

      {canWrite && <FeedbackForm poolId={state.pool.id} />}

      {!formed && <EmptyState title='No reviews yet'>Members can review the pool once its masternode is registered.</EmptyState>}
      {formed && feedback.length === 0 && !canWrite && <EmptyState title='No reviews yet' />}

      <ul className='flex flex-col gap-4'>
        {feedback.map(f => (
          <li key={f.id} className='rounded-2xl bg-surface-2 p-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <IdentityChip id={f.ownerId} size='sm' />
              <span className='flex items-center gap-2'><Stars value={f.rating} size={14} /><span className='text-tag text-muted'>{relativeTime(f.createdAt)}</span></span>
            </div>
            {f.text !== '' && <p className='mt-2 text-small'>{f.text}</p>}
          </li>
        ))}
      </ul>
      <p className='text-tag text-muted'>Only reviews from members of the registered masternode count toward the creator’s rating.</p>
    </div>
  )
}

function FeedbackForm ({ poolId }: { poolId: string }): ReactNode {
  const { activeIdentity } = useWallet()
  const { notify } = useToast()
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')

  const submit = useWrite(async () => {
    if (activeIdentity == null) throw new Error('Connect your identity first')
    return await backend.platform.createFeedback(activeIdentity, { poolId, rating, text: text.trim() })
  })

  return (
    <div className='flex flex-col gap-3 rounded-2xl border border-line/70 p-4'>
      <span className='text-small font-bold'>Rate this pool</span>
      <div className='flex gap-1' role='radiogroup' aria-label='Rating'>
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            type='button'
            role='radio'
            aria-checked={rating === i}
            aria-label={`${i} star${i === 1 ? '' : 's'}`}
            onClick={() => setRating(i)}
            className={cn('text-2xl leading-none', i <= rating ? 'text-orange' : 'text-line hover:text-orange/60')}
          >
            ★
          </button>
        ))}
      </div>
      <Textarea rows={3} showPasteButton={false} value={text} onChange={v => setText(v.slice(0, 1000))} placeholder='How was the creator to work with? Is the node reliable?' aria-label='Review' />
      <div className='flex items-center justify-between gap-3'>
        <span className='text-tag text-muted'>Reviews are permanent and can’t be edited.</span>
        <Button
          size='sm'
          colorScheme='brand'
          disabled={rating === 0 || submit.isPending}
          onClick={() => submit.mutate(undefined, { onSuccess: () => notify('Review published'), onError: e => notify(errorMessage(e), 'error') })}
        >
          Publish review
        </Button>
      </div>
    </div>
  )
}
