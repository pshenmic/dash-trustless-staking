import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { backend } from '../../data'
import {
  chatParticipants, findChatKey, loadGroupKey, loadPrivateMessages, sendPrivateMessage, startPrivateChat
} from '../../data/privateChat'
import type { PoolState } from '../../data/queries'
import { useWrite } from '../../hooks/data'
import { pluralize } from '../../lib/format'
import { useWallet } from '../../wallet/WalletContext'
import { IdentityChip } from '../bits'
import { Button } from '../Button'
import { ChatComposer, ChatMessages } from '../Chat'
import { errorMessage, useToast } from '../Toast'
import { EmptyState, Loading, Notice } from '../ui'
import { poolRole } from './role'

/**
 * Encrypted chat for the pool's selected members. It opens at the lock; only members who joined with an
 * encryption key take part. The creator is not in it unless they also hold a share.
 */
export function PrivateChat ({ state }: { state: PoolState }): ReactNode {
  const { activeIdentity } = useWallet()
  const { notify } = useToast()
  const role = poolRole(state, activeIdentity)
  const lock = state.lock
  const participants = chatParticipants(state)
  const canTakePart = role.myMember?.join.encryptionKeyId != null

  const chatKeys = useQuery({
    queryKey: ['chat-keys', lock?.id],
    queryFn: async () => await backend.platform.listChatKeys(lock?.id ?? ''),
    enabled: lock != null && canTakePart,
    refetchInterval: 10_000
  })
  const chatKey = chatKeys.data == null ? null : findChatKey(chatKeys.data, state)

  // Opening the envelope is the one step that uses the member's encryption key
  const groupKey = useQuery({
    queryKey: ['group-key', chatKey?.id, activeIdentity],
    queryFn: async () => chatKey == null || activeIdentity == null ? null : await loadGroupKey(activeIdentity, state, chatKey),
    enabled: chatKey != null && activeIdentity != null && canTakePart,
    staleTime: Infinity
  })

  const messages = useQuery({
    queryKey: ['private-messages', chatKey?.id, activeIdentity],
    queryFn: async () => chatKey == null || groupKey.data == null ? [] : await loadPrivateMessages(state, chatKey, groupKey.data),
    enabled: chatKey != null && groupKey.data != null,
    refetchInterval: 8_000
  })

  const start = useWrite(async () => {
    if (activeIdentity == null) throw new Error('Connect your identity first')
    await startPrivateChat(activeIdentity, state)
  })

  if (!backend.features.privateChat) {
    return (
      <EmptyState title='Log in to use the private chat'>
        The private chat opens a member’s copy of the chat key with their identity’s encryption key. Log in with
        your private keys on testnet to read it, or use the public chat.
      </EmptyState>
    )
  }
  if (lock == null) {
    return <EmptyState title='Opens when the pool is locked'>The private chat is for the members the creator selects. Until then, use the public chat.</EmptyState>
  }
  if (role.myMember == null) {
    return (
      <EmptyState title='Members only'>
        {role.isCreator
          ? 'Only members with a share can read this chat. As the creator you’re not part of it unless you also hold a share.'
          : 'Only members with a share in this pool can read this chat.'}
      </EmptyState>
    )
  }
  if (!canTakePart) {
    return (
      <EmptyState title='You joined without an encryption key'>
        The private chat is encrypted to a key on each member’s identity. Your join has none, and a join can’t be changed, so you can’t read this pool’s private chat.
      </EmptyState>
    )
  }
  if (chatKeys.isLoading) return <Loading />

  const members = (
    <div className='flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface-2 px-4 py-3 text-small'>
      <span className='text-muted'>Encrypted for {pluralize(participants.length, 'member')}:</span>
      {participants.map(m => <IdentityChip key={m.join.id} id={m.join.ownerId} size='sm' />)}
      {participants.length < state.members.length && (
        <span className='text-muted'>({pluralize(state.members.length - participants.length, 'member')} joined without a key)</span>
      )}
    </div>
  )

  if (chatKey == null) {
    return (
      <div className='flex flex-col gap-4'>
        {members}
        <EmptyState
          title='Start the private chat'
          action={
            <Button
              colorScheme='brand'
              size='md'
              disabled={start.isPending}
              onClick={() => start.mutate(undefined, { onSuccess: () => notify('Private chat started'), onError: e => notify(errorMessage(e), 'error') })}
            >
              {start.isPending ? 'Publishing…' : 'Start private chat'}
            </Button>
          }
        >
          Nobody has started it yet. Starting creates the chat’s key in your browser and publishes a locked copy for each member. The creator never sees it.
        </EmptyState>
      </div>
    )
  }
  if (groupKey.isLoading) return <Loading label='Opening the chat key…' />
  if (groupKey.data == null) {
    return (
      <Notice tone='error' title='Can’t open the chat key'>
        The chat was started without a copy of the key that your identity key opens. Ask the member who started it.
      </Notice>
    )
  }

  const key = groupKey.data
  return (
    <div className='flex flex-col gap-4'>
      {members}
      <ChatMessages messages={messages.data} loading={messages.isLoading} empty='Only the members above can read what you write here.' />
      <ChatComposer
        onSend={async text => await sendPrivateMessage(activeIdentity as string, lock.id, key, text)}
        note='Encrypted for the pool’s members. Still permanent: it can’t be deleted.'
      />
    </div>
  )
}
