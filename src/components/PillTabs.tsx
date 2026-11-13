import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from './ui'

export interface PillTab {
  value: string
  label: string
  count?: number
}

/** Figma pill tabs: rounded, tinted, with a count bubble; keyboard arrows move the selection */
export function PillTabs ({ tabs, value, onChange }: {
  tabs: PillTab[]
  value: string
  onChange: (value: string) => void
}): ReactNode {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const index = tabs.findIndex(tab => tab.value === value)
    if (index < 0) return
    event.preventDefault()
    const next = event.key === 'ArrowRight'
      ? (index + 1) % tabs.length
      : (index - 1 + tabs.length) % tabs.length
    onChange(tabs[next].value)
    refs.current[tabs[next].value]?.focus()
  }

  return (
    <div role='tablist' className='flex gap-2 overflow-x-auto py-3' onKeyDown={onKeyDown}>
      {tabs.map(tab => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            ref={node => { refs.current[tab.value] = node }}
            type='button'
            role='tab'
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-small font-bold transition-colors',
              active ? 'bg-brand-soft text-brand-ink' : 'text-muted hover:text-fg'
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span className={cn('rounded-full px-1.5 py-0.5 text-tag font-bold', active ? 'bg-surface text-brand-ink' : 'bg-surface-2 text-muted')}>
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}