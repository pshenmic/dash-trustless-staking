import { useQueries } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { fetchOperatorKeyUsage, type OperatorKeyUsage } from '../data/queries'
import { formatBasisPoints } from '../lib/format'
import { operatorId, type OperatorProvider } from '../operators'
import { Flag, locationText } from './Flag'
import { cn, Spinner } from './ui'

type KeyStatus = 'available' | 'reserved' | 'in-use'

const STATUS: Record<KeyStatus, { dot: string, label: (usage: OperatorKeyUsage) => string }> = {
  available: { dot: 'bg-mint', label: () => 'Available' },
  // Yellow is not a brand color; it was asked for explicitly to read as "taken, but not final"
  reserved: { dot: 'bg-[#F7C325]', label: usage => `Reserved by ${usage.otherPools[0]?.name ?? 'another pool'}` },
  'in-use': { dot: 'bg-red', label: () => 'In use by a masternode' }
}

function keyStatus (usage: OperatorKeyUsage): KeyStatus {
  if (usage.masternode != null) return 'in-use'
  if (usage.otherPools.length > 0) return 'reserved'
  return 'available'
}

/**
 * A third-party operator's keys, each checked against the masternode list and the pool operatorPubKey
 * index. Only free keys can be picked: one key backs one masternode.
 *   green   available
 *   yellow  used by another pool that hasn't registered yet (only one of them can)
 *   red     held by a masternode
 */
export function OperatorKeyPicker ({ provider, value, onChange }: {
  provider: OperatorProvider
  value: string
  onChange: (operatorPubKey: string) => void
}): ReactNode {
  const usages = useQueries({
    queries: provider.keys.map(key => ({
      queryKey: ['operator-key', key.pubKey.toLowerCase()],
      queryFn: async () => await fetchOperatorKeyUsage(key.pubKey.toLowerCase())
    }))
  })

  return (
    <div role='radiogroup' aria-label={`${provider.name} operator keys`} className='flex flex-col gap-2'>
      {provider.keys.map((key, i) => {
        const usage = usages[i].data
        const status = usage == null ? null : keyStatus(usage)
        const free = status === 'available'
        const selected = value === key.pubKey.toLowerCase()
        return (
          <button
            key={key.pubKey}
            type='button'
            role='radio'
            aria-checked={selected}
            disabled={!free}
            onClick={() => onChange(key.pubKey.toLowerCase())}
            className={cn(
              'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
              selected ? 'border-brand bg-brand-soft' : 'border-line/70',
              free ? 'hover:border-brand/60' : 'cursor-not-allowed',
              status != null && !free && 'bg-surface-2/60'
            )}
          >
            <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border-2', selected ? 'border-brand' : 'border-line')}>
              {selected && <span className='size-2 rounded-full bg-brand' />}
            </span>

            <span className='flex w-24 shrink-0 items-center gap-2'>
              {status == null
                ? <Spinner className='size-2.5 border' />
                : (
                  <span className={cn('size-2.5 shrink-0 rounded-full', STATUS[status].dot)} title={usage == null ? undefined : STATUS[status].label(usage)}>
                    <span className='sr-only'>{usage == null ? '' : STATUS[status].label(usage)}</span>
                  </span>
                  )}
              <span className={cn('font-mono font-semibold', !free && status != null && 'text-muted')}>{operatorId(key.pubKey)}</span>
            </span>

            <span className='w-16 shrink-0 text-small'>
              <span className='font-bold'>{formatBasisPoints(key.operatorReward)}</span>
              <span className='text-muted'> fee</span>
            </span>

            <span className='flex min-w-0 flex-1 items-center gap-2 text-small'>
              <Flag country={key.country} />
              <span className='truncate'>{locationText(key.country, key.city)}</span>
            </span>

            <span className='hidden shrink-0 text-tag text-muted sm:block'>
              {usage == null || status == null ? '' : STATUS[status].label(usage)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
