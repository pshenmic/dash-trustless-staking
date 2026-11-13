import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { backend } from '../../data'
import type { PoolState } from '../../data/queries'
import { useMessages } from '../../hooks/data'
import { formatDateTime, relativeTime } from '../../lib/format'
import { poolTimeline, type TimelineItem } from '../../lib/timeline'
import { useWallet } from '../../wallet/WalletContext'
import { ChatComposer } from '../Chat'
import { IdentityChip } from '../bits'
import { Button } from '../Button'
import { cn, Loading } from '../ui'

/**
 * The Chat tab: public messages merged with the pool events that carry a timestamp (joins, the lock,
 * signatures). Chain facts stay in Activity, where they can show their block height.
 */
export function PoolChat ({ state }: { state: PoolState }): ReactNode {
  const { data: messages, isLoading } = useMessages(state.pool.id)
  const items = useMemo(() => poolTimeline(state, messages ?? []), [state, messages])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (list != null) list.scrollTop = list.scrollHeight
  }, [items.length])

  return (
    <div ref={listRef} className='flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1'>
      {isLoading && <Loading />}
      {items.map(item => <TimelineRow key={`${item.kind}:${item.id}`} item={item} highlight={state.pool.ownerId} />)}
    </div>
  )
}

/** The composer is placed by the sheet below the action bar, as in the Figma */
export function PoolComposer ({ state }: { state: PoolState }): ReactNode {
  const { activeIdentity, openLogin } = useWallet()

  if (activeIdentity == null) {
    return (
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-small'>
        <span className='text-muted'>Messages are public and permanent. Log in to write.</span>
        <Button size='sm' colorScheme='brand' onClick={openLogin}>Log in</Button>
      </div>
    )
  }

  return (
    <ChatComposer
      onSend={async text => await backend.platform.sendMessage(activeIdentity, { channel: state.pool.id, text })}
      note='Messages are public and permanent on Dash Platform.'
    />
  )
}

function TimelineRow ({ item, highlight }: { item: TimelineItem, highlight: string }): ReactNode {
  const { activeIdentity } = useWallet()

  if (item.kind === 'event') {
    return (
      <div className='flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2 text-center text-tag text-muted'>
        {item.ownerId != null && <IdentityChip id={item.ownerId} size='sm' />}
        <span>{item.text}</span>
        <time dateTime={new Date(item.at).toISOString()} title={formatDateTime(item.at)}>{relativeTime(item.at)}</time>
      </div>
    )
  }

  const mine = item.ownerId === activeIdentity
  return (
    <div className={cn('flex max-w-[85%] flex-col gap-1', mine && 'self-end items-end')}>
      <div className='flex items-center gap-2 text-tag text-muted'>
        <IdentityChip
          id={item.ownerId}
          size='sm'
          suffix={item.ownerId === highlight ? <span className='rounded-full bg-brand-soft px-2 py-0.5 text-brand-ink'>Creator</span> : null}
        />
        <time dateTime={new Date(item.at).toISOString()} title={formatDateTime(item.at)}>{relativeTime(item.at)}</time>
      </div>
      <div className={cn(
        'rounded-2xl px-4 py-2.5 text-small break-words whitespace-pre-wrap',
        mine ? 'rounded-tr-md bg-brand text-white' : 'rounded-tl-md bg-surface-2'
      )}
      >
        {item.text}
      </div>
    </div>
  )
}