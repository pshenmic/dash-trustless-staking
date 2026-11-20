import { Textarea } from 'dash-ui-kit/react'
import { Button } from './Button'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { backend } from '../data'
import { useMessages, useWrite } from '../hooks/data'
import { formatDateTime, relativeTime } from '../lib/format'
import { compareFeed } from '../lib/timeline'
import { useWallet } from '../wallet/WalletContext'
import { IdentityChip } from './bits'
import type { PoolEvent } from './pool/activity'
import { errorMessage, useToast } from './Toast'
import { cn, EmptyState, Loading } from './ui'

const MAX_LENGTH = 1000

export interface ChatLine {
  id: string
  ownerId: string
  createdAt: number
  text: string
}

function FeedEvent ({ event }: { event: PoolEvent }): ReactNode {
  return (
    <div className='flex max-w-[85%] flex-wrap items-center gap-x-2 gap-y-1 self-center rounded-full bg-surface-2 px-3 py-1 text-tag text-muted'>
      <span className={cn(
        'size-1.5 shrink-0 rounded-full',
        event.tone === 'brand' ? 'bg-brand' : event.tone === 'mint' ? 'bg-mint' : event.tone === 'red' ? 'bg-red' : 'bg-line'
      )}
      />
      {event.who != null && <IdentityChip id={event.who} size='sm' />}
      <span>{event.text}</span>
      {event.at != null && (
        <time dateTime={new Date(event.at).toISOString()} title={formatDateTime(event.at)}>{relativeTime(event.at)}</time>
      )}
    </div>
  )
}

function MessageBubble ({ message, mine, creator }: { message: ChatLine, mine: boolean, creator: boolean }): ReactNode {
  return (
    <div className={cn('flex max-w-[85%] flex-col gap-1', mine && 'self-end items-end')}>
      <div className='flex items-center gap-2 text-tag text-muted'>
        <IdentityChip
          id={message.ownerId}
          size='sm'
          link={creator}
          suffix={creator ? <span className='rounded-full bg-brand-soft px-2 py-0.5 text-brand-ink'>Creator</span> : null}
        />
        <time dateTime={new Date(message.createdAt).toISOString()} title={formatDateTime(message.createdAt)}>{relativeTime(message.createdAt)}</time>
      </div>
      <div className={cn(
        'rounded-2xl px-4 py-2.5 text-small break-words whitespace-pre-wrap',
        mine ? 'rounded-tr-md bg-brand text-white' : 'rounded-tl-md bg-surface-2'
      )}
      >
        {message.text}
      </div>
    </div>
  )
}

/** Divider marking where the last visit ended; everything below it arrived since */
function LastVisitDivider ({ at }: { at: number }): ReactNode {
  return (
    <div className='flex items-center gap-3 text-tag text-muted'>
      <span className='h-px flex-1 bg-line/60' aria-hidden />
      <span title={formatDateTime(at)}>You were last here {relativeTime(at)}</span>
      <span className='h-px flex-1 bg-line/60' aria-hidden />
    </div>
  )
}

/** One chronological feed of messages and pool events, newest at the bottom. Shared by both chats. */
export function ChatMessages ({ messages, events = [], loading, highlight = [], empty, since }: {
  messages: ChatLine[] | undefined
  /** Pool lifecycle events, shown inline between the messages */
  events?: PoolEvent[]
  loading: boolean
  /** Identities tagged as the pool creator */
  highlight?: string[]
  empty: string
  /** Mark the first row recorded after this moment as the end of the previous visit */
  since?: number
}): ReactNode {
  const { activeIdentity } = useWallet()
  const listRef = useRef<HTMLDivElement>(null)

  const sorted = [
    ...events.map((event, i) => ({ at: event.at, node: <FeedEvent key={`event-${i}`} event={event} /> })),
    ...(messages ?? []).map(message => ({
      at: message.createdAt as number | null,
      node: <MessageBubble key={message.id} message={message} mine={message.ownerId === activeIdentity} creator={highlight.includes(message.ownerId)} />
    }))
  ].sort(compareFeed)

  const cutoff = since ?? null
  const firstNew = cutoff == null ? -1 : sorted.findIndex(row => row.at != null && row.at > cutoff)
  const nodes: ReactNode[] = sorted.map(row => row.node)
  if (cutoff != null && firstNew >= 0) nodes.splice(firstNew, 0, <LastVisitDivider key='last-visit' at={cutoff} />)

  useEffect(() => {
    const list = listRef.current
    if (list != null) list.scrollTop = list.scrollHeight
  }, [nodes.length])

  return (
    <div ref={listRef} className='flex max-h-[480px] flex-col gap-3 overflow-y-auto pr-1'>
      {loading && <Loading />}
      {!loading && nodes.length === 0 && <EmptyState title='No messages yet'>{empty}</EmptyState>}
      {nodes}
    </div>
  )
}

/** Message box with a send button and a one-line note about who can read the message */
export function ChatComposer ({ onSend, note }: { onSend: (text: string) => Promise<unknown>, note: string }): ReactNode {
  const { notify } = useToast()
  const [text, setText] = useState('')
  const send = useWrite(onSend)

  const submit = (): void => {
    const body = text.trim()
    if (body === '') return
    send.mutate(body, {
      onSuccess: () => setText(''),
      onError: e => notify(errorMessage(e), 'error')
    })
  }

  return (
    <div className='flex flex-col gap-2'>
      <Textarea
        rows={2}
        showPasteButton={false}
        value={text}
        onChange={v => setText(v.slice(0, MAX_LENGTH))}
        placeholder='Write a message'
        aria-label='Message'
      />
      <div className='flex items-center justify-between gap-3'>
        <span className='text-tag text-muted'>{note}</span>
        <Button size='sm' colorScheme='brand' disabled={text.trim() === '' || send.isPending} onClick={submit}>
          {send.isPending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  )
}

/** Public chat over `message` documents. Every message is a public, permanent Platform document. */
export function Chat ({ channel, events, highlight = [], since }: { channel: string, events?: PoolEvent[], highlight?: string[], since?: number }): ReactNode {
  const { data: messages, isLoading } = useMessages(channel)
  const { activeIdentity, openLogin } = useWallet()

  return (
    <div className='flex flex-col gap-4'>
      <ChatMessages messages={messages} events={events} loading={isLoading} highlight={highlight} empty='Say hello to the other members.' since={since} />
      {activeIdentity == null
        ? (
          <div className='flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-small'>
            <span className='text-muted'>Log in to write.</span>
            <Button size='sm' colorScheme='brand' onClick={openLogin}>Log in</Button>
          </div>
          )
        : (
          <ChatComposer
            onSend={async text => await backend.platform.sendMessage(activeIdentity, { channel, text })}
            note='Messages are public and permanent on Dash Platform.'
          />
          )}
    </div>
  )
}