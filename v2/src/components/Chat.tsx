import { Textarea } from 'dash-ui-kit/react'
import { Button } from './Button'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { backend } from '../data'
import { useMessages, useWrite } from '../hooks/data'
import { formatDateTime, relativeTime } from '../lib/format'
import { useWallet } from '../wallet/WalletContext'
import { IdentityChip } from './bits'
import { errorMessage, useToast } from './Toast'
import { cn, EmptyState, Loading } from './ui'

const MAX_LENGTH = 1000

export interface ChatLine {
  id: string
  ownerId: string
  createdAt: number
  text: string
}

/** Message bubbles, newest at the bottom. Shared by the public and private chats. */
export function ChatMessages ({ messages, loading, highlight = [], empty }: {
  messages: ChatLine[] | undefined
  loading: boolean
  /** Identities tagged as the pool creator */
  highlight?: string[]
  empty: string
}): ReactNode {
  const { activeIdentity } = useWallet()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (list != null) list.scrollTop = list.scrollHeight
  }, [messages?.length])

  return (
    <div ref={listRef} className='flex max-h-[480px] flex-col gap-3 overflow-y-auto pr-1'>
      {loading && <Loading />}
      {messages?.length === 0 && <EmptyState title='No messages yet'>{empty}</EmptyState>}
      {messages?.map(m => {
        const mine = m.ownerId === activeIdentity
        return (
          <div key={m.id} className={cn('flex max-w-[85%] flex-col gap-1', mine && 'self-end items-end')}>
            <div className='flex items-center gap-2 text-tag text-muted'>
              <IdentityChip id={m.ownerId} size='sm' link={highlight.includes(m.ownerId)} suffix={highlight.includes(m.ownerId) ? <span className='rounded-full bg-brand-soft px-2 py-0.5 text-brand-ink'>Creator</span> : null} />
              <time dateTime={new Date(m.createdAt).toISOString()} title={formatDateTime(m.createdAt)}>{relativeTime(m.createdAt)}</time>
            </div>
            <div className={cn(
              'rounded-2xl px-4 py-2.5 text-small break-words whitespace-pre-wrap',
              mine ? 'rounded-tr-md bg-brand text-white' : 'rounded-tl-md bg-surface-2'
            )}
            >
              {m.text}
            </div>
          </div>
        )
      })}
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
export function Chat ({ channel, highlight = [] }: { channel: string, highlight?: string[] }): ReactNode {
  const { data: messages, isLoading } = useMessages(channel)
  const { activeIdentity, connect, status } = useWallet()

  return (
    <div className='flex flex-col gap-4'>
      <ChatMessages messages={messages} loading={isLoading} highlight={highlight} empty='Say hello to the other members.' />
      {activeIdentity == null
        ? (
          <div className='flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-small'>
            <span className='text-muted'>Connect your identity to write.</span>
            {status !== 'unavailable' && <Button size='sm' colorScheme='brand' onClick={() => { void connect() }}>Connect</Button>}
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
