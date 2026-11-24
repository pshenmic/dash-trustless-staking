import { Dialog, Input, Textarea } from 'dash-ui-kit/react'
import { useEffect, useState, type ReactNode } from 'react'
import { backend } from '../../data'
import type { PoolState } from '../../data/queries'
import { useWrite } from '../../hooks/data'
import { latestCreatorMeta } from '../../lib/poolName'
import { useGeneration } from '../../generations'
import type { PoolMeta } from '../../lib/types'
import { useWallet } from '../../wallet/WalletContext'
import { Button } from '../Button'
import { errorMessage, useToast } from '../Toast'
import { Field, Notice } from '../ui'

interface Props {
  state: PoolState
  metas: PoolMeta[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The creator's promotional details: title, description and the archived flag, published as a poolMeta document.
 * These are display overrides only — the terms in the pool document stay untouched and immutable. The
 * type is append-only, so each save adds a document instead of rewriting one; the newest wins.
 */
export function EditPoolDetails ({ state, metas, open, onOpenChange }: Props): ReactNode {
  const { notify } = useToast()
  const { activeIdentity } = useWallet()
  const { ref } = useGeneration()
  const current = latestCreatorMeta(metas, state.pool.ownerId)
  // A generation 1 pool carries its own name and description; for generation 2 the only source is
  // poolMeta, so the anonymous fallback in state.pool.name is not something the creator typed
  const ownName = state.pool.documentName ?? ''
  const ownDescription = state.pool.documentName != null ? state.pool.description : ''
  const [name, setName] = useState(current?.name ?? ownName)
  const [description, setDescription] = useState(current?.description ?? ownDescription)
  const [archived, setArchived] = useState(current?.archived === true)

  // The metadata query may resolve after the page mounts, so prefill on every open rather than at mount
  useEffect(() => {
    if (!open) return
    setName(current?.name ?? ownName)
    setDescription(current?.description ?? ownDescription)
    setArchived(current?.archived === true)
  }, [open, current, ownName, ownDescription])

  const save = useWrite(async () => {
    if (activeIdentity == null) throw new Error('Connect your identity first')
    // Omitted fields fall back to the pool document — for a pool created without them, that means
    // anonymous. Clearing a box is therefore how the creator removes a title.
    return await backend.platform.createPoolMeta(activeIdentity, {
      poolId: state.pool.id,
      ...(name.trim() !== '' ? { name: name.trim() } : {}),
      ...(description.trim() !== '' ? { description: description.trim() } : {}),
      ...(archived ? { archived: true } : {})
    })
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title='Pool details'
      maxWidth='xl'
      horizontalMargin={12}
      className='max-h-[92dvh] overflow-y-auto !rounded-3xl dark:!border-line dark:!bg-surface'
    >
      <div className='flex flex-col gap-5'>
        <p className='text-small text-muted'>
          A title and a description for the pools grid. These are display details only: the pool’s
          terms, collateral and members are never touched.
        </p>

        <Field label='Title' optional htmlFor='pool-meta-name' hint='Shown on the pools grid and the pool page. Leave empty to stay anonymous.'>
          <Input id='pool-meta-name' value={name} maxLength={63} onChange={e => setName(e.target.value)} placeholder='Anonymous pool' />
        </Field>

        <Field label='Description' optional htmlFor='pool-meta-description'>
          <Textarea id='pool-meta-description' rows={4} showPasteButton={false} value={description} onChange={v => setDescription(v.slice(0, 1000))} placeholder='Who you are, what the pool is for, how you’ll keep the node online' />
        </Field>

        {ref.archivedPool && (
          <label className='flex cursor-pointer items-start gap-3 rounded-2xl border border-line/70 p-4'>
            <input
              type='checkbox'
              className='mt-0.5 size-4 shrink-0'
              checked={archived}
              onChange={e => setArchived(e.target.checked)}
            />
            <span>
              <span className='block text-small font-bold'>Archive this pool</span>
              <span className='block text-tag text-muted'>
                Marks it as retired and sinks it to the bottom of the grid. Nothing is deleted — members can still
                sign, register or dissolve it, and you can unarchive it any time.
              </span>
            </span>
          </label>
        )}

        <Notice tone='info' title='Every save is a new revision'>
          Details are append-only on Platform, so an earlier title stays in the record. The newest one is
          the one everybody sees.
        </Notice>

        <div className='flex flex-wrap items-center gap-3'>
          <Button
            colorScheme='brand'
            size='md'
            disabled={save.isPending}
            onClick={() => save.mutate(undefined, {
              onSuccess: () => { notify('Pool details saved'); onOpenChange(false) },
              onError: e => notify(errorMessage(e), 'error')
            })}
          >
            {save.isPending ? 'Saving…' : 'Save details'}
          </Button>
          <Button size='md' onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  )
}