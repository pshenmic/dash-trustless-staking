import type { ReactNode } from 'react'
import type { ActionBarAction, ActionBarModel, ActionBarRing, ActionTone } from '../../lib/actionBar'
import { Button } from '../Button'
import { Spinner, cn } from '../ui'

const TONE: Record<ActionTone, string> = {
  blue: 'from-[#e6f4fd] to-[#cde9fb] dark:from-[#123049] dark:to-[#173a58]',
  peach: 'from-[#fff6e5] to-[#ffe9c9] dark:from-[#3a2c14] dark:to-[#46351a]',
  mint: 'from-[#eafbf2] to-[#d6f5e4] dark:from-[#12362a] dark:to-[#174434]',
  red: 'from-[#fdeded] to-[#f8dada] dark:from-[#3a1e22] dark:to-[#451f24]',
  grey: 'from-[#f4f6fa] to-[#eef1f5] dark:from-[#16293f] dark:to-[#1b3149]',
  neutral: 'from-[#f4f6fa] to-[#eef1f5] dark:from-[#16293f] dark:to-[#1b3149]'
}

const RING: Record<ActionTone, string> = {
  blue: 'stroke-brand',
  peach: 'stroke-orange',
  mint: 'stroke-mint',
  red: 'stroke-red',
  grey: 'stroke-muted',
  neutral: 'stroke-muted'
}

/** The Figma's pinned state bar: a ring, what is happening, and the one action that moves it forward */
export function ActionBar ({ model, onAction }: {
  model: ActionBarModel
  onAction: (action: ActionBarAction) => void
}): ReactNode {
  const action = model.action
  return (
    <div className={cn('flex items-center gap-3 rounded-[16px] bg-gradient-to-r px-3.5 py-3', TONE[model.tone])}>
      {model.ring != null && <ProgressRing ring={model.ring} tone={model.tone} />}
      <div className='min-w-0 flex-1'>
        <div className='truncate text-small font-extrabold'>{model.title}</div>
        <div className='truncate text-tag text-muted'>{model.subtitle}</div>
      </div>
      {model.busy
        ? <Spinner className='shrink-0' />
        : action != null && (
          <Button
            size='sm'
            colorScheme={model.tone === 'mint' ? 'mint' : 'brand'}
            disabled={action.disabled}
            onClick={() => onAction(action)}
            className='shrink-0'
          >
            {action.label}
          </Button>
          )}
    </div>
  )
}

function ProgressRing ({ ring, tone }: { ring: ActionBarRing, tone: ActionTone }): ReactNode {
  const radius = 22
  const circumference = 2 * Math.PI * radius
  const filled = ring.max === 0 ? 0 : Math.min(1, ring.value / ring.max)
  return (
    <span className='relative size-[52px] shrink-0'>
      <svg viewBox='0 0 52 52' className='size-full -rotate-90' aria-hidden>
        <circle cx='26' cy='26' r={radius} fill='none' strokeWidth='4' className='stroke-white/70 dark:stroke-white/10' />
        <circle
          cx='26'
          cy='26'
          r={radius}
          fill='none'
          strokeWidth='4'
          strokeLinecap='round'
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled)}
          className={RING[tone]}
        />
      </svg>
      <span className='absolute inset-0 flex items-center justify-center text-tag font-extrabold'>{ring.label}</span>
    </span>
  )
}