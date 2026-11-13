import { Avatar } from 'dash-ui-kit/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useUsername } from '../hooks/data'
import { COLLATERAL } from '../lib/consensus'
import { duffsToDashString, shortId } from '../lib/format'
import type { Duffs, PoolListStatus, PoolStatus } from '../lib/types'
import { cn } from './ui'

/** An amount in DASH, with the unit set smaller */
export function Dash ({ duffs, className, unit = true }: { duffs: Duffs, className?: string, unit?: boolean }): ReactNode {
  return (
    <span className={cn('whitespace-nowrap', className)}>
      {duffsToDashString(duffs)}{unit && <span className='ml-1 text-[0.75em] font-semibold opacity-70'>DASH</span>}
    </span>
  )
}

const STATUS_STYLE: Record<PoolStatus | 'LOCKED', { label: string, className: string, dot: string }> = {
  NEW: { label: 'Open', className: 'bg-orange-soft text-orange-ink', dot: 'bg-orange' },
  LOCKED: { label: 'Locked', className: 'bg-brand-soft text-brand-ink', dot: 'bg-brand' },
  SIGNING: { label: 'Signing', className: 'bg-orange-soft text-orange-ink', dot: 'bg-orange' },
  REGISTERED: { label: 'Registered', className: 'bg-brand-soft text-brand-ink', dot: 'bg-brand' },
  FORMED: { label: 'Formed', className: 'bg-mint-soft text-mint-ink', dot: 'bg-mint' },
  ERROR: { label: 'Error', className: 'bg-red-soft text-red-ink', dot: 'bg-red' },
  DISSOLVING: { label: 'Dissolving', className: 'bg-orange-soft text-orange-ink', dot: 'bg-orange' },
  DISSOLVED: { label: 'Dissolved', className: 'bg-surface-2 text-muted', dot: 'bg-muted' }
}

export function StatusBadge ({ status, size = 'md' }: { status: PoolStatus | PoolListStatus, size?: 'sm' | 'md' }): ReactNode {
  const style = STATUS_STYLE[status]
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-semibold',
      size === 'sm' ? 'px-2.5 py-1 text-tag' : 'px-3 py-1.5 text-small',
      style.className
    )}
    >
      <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden />
      {style.label}
    </span>
  )
}

/** Avatar plus DPNS username (or short identifier), optionally linking to the creator profile */
export function IdentityChip ({ id, link = false, size = 'md', suffix }: { id: string, link?: boolean, size?: 'sm' | 'md', suffix?: ReactNode }): ReactNode {
  const username = useUsername(id)
  const content = (
    <span className='inline-flex min-w-0 items-center gap-2'>
      <span className={cn('shrink-0 overflow-hidden rounded-full bg-surface-2', size === 'sm' ? 'size-6' : 'size-8')}>
        <Avatar username={id} className='size-full' />
      </span>
      <span className={cn('truncate font-semibold', size === 'sm' && 'text-small')} title={id}>
        {username ?? shortId(id, 6)}
      </span>
      {suffix}
    </span>
  )
  if (!link) return content
  return (
    <Link to={`/creators/${id}`} className='min-w-0 hover:text-brand-ink'>
      {content}
    </Link>
  )
}

/** Progress toward the 1000 DASH collateral; over-subscribed pools show the full bar */
export function FillBar ({ joined, className }: { joined: Duffs, className?: string }): ReactNode {
  const pct = Math.min(100, (joined / COLLATERAL) * 100)
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-brand-soft', className)} role='progressbar' aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width]', pct >= 100 ? 'bg-mint' : 'bg-brand')} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function YouTag (): ReactNode {
  return <span className='rounded-full bg-brand px-2 py-0.5 text-tag text-white'>You</span>
}
