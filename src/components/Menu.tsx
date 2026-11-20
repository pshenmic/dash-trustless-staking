import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from './ui'

export interface MenuItem {
  label: string
  onClick?: () => void
  to?: string
}

/**
 * Trigger plus a dropdown of actions. The panel closes on outside click, Escape and after an action.
 * The trigger style is overridden wholesale when `triggerClassName` is given, so callers do not inherit
 * the default pill shape.
 */
export function Menu ({ trigger, triggerLabel, items, triggerClassName, menuClassName }: { trigger: ReactNode, triggerLabel?: string, items: MenuItem[], triggerClassName?: string, menuClassName?: string }): ReactNode {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent): void => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(ref.current?.contains(e.target as Node) ?? false)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const itemClass = 'block w-full rounded-xl px-3 py-2 text-left text-small font-semibold hover:bg-surface-2'
  return (
    <div ref={ref} className='relative'>
      <button
        type='button'
        aria-haspopup='menu'
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen(o => !o)}
        className={triggerClassName ?? 'max-w-44 rounded-full border border-line bg-surface py-1 pr-3 pl-1 hover:border-brand/60'}
      >
        {trigger}
      </button>
      {open && (
        <div role='menu' className={cn('absolute right-0 z-50 mt-2 rounded-2xl border border-line/60 bg-surface p-1.5 shadow-card', menuClassName ?? 'w-56')}>
          {items.map(item => item.to != null
            ? <Link key={item.label} role='menuitem' to={item.to} className={itemClass} onClick={() => setOpen(false)}>{item.label}</Link>
            : <button key={item.label} role='menuitem' type='button' className={itemClass} onClick={() => { setOpen(false); item.onClick?.() }}>{item.label}</button>)}
        </div>
      )}
    </div>
  )
}