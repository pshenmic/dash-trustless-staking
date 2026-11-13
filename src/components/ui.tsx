import { CopyButton } from 'dash-ui-kit/react'
import type { ReactNode } from 'react'

/*
 * Layout primitives on the brand tokens (src/index.css). Components that dash-ui-kit already
 * provides (Button, Input, Tabs, Dialog, Identifier, Avatar, ...) are used from the kit directly.
 */

export function cn (...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * A hash or id shown in full when the row has room and ellipsised by CSS when it does not. The DOM
 * always carries the whole value, so it stays selectable and copyable even when cut short, and the
 * copy button always copies the full string.
 */
export function IdentifierValue ({ value, href, label }: { value: string, href?: string, label: string }): ReactNode {
  const text = <span className='min-w-0 flex-1 truncate font-mono text-small' title={value}>{value}</span>

  return (
    <span className='flex min-w-0 items-center gap-1'>
      {href == null
        ? text
        : <a href={href} target='_blank' rel='noreferrer' className='flex min-w-0 flex-1 text-brand-ink hover:underline'>{text}</a>}
      <CopyButton text={value} aria-label={`Copy ${label}`} />
    </span>
  )
}

export function Card ({ children, className, padded = true }: { children: ReactNode, className?: string, padded?: boolean }): ReactNode {
  return (
    <div className={cn('rounded-[20px] border-0 bg-surface shadow-card', padded && 'p-5 md:p-6', className)}>
      {children}
    </div>
  )
}

export function PageHeader ({ title, subtitle, actions, eyebrow }: { title: ReactNode, subtitle?: ReactNode, actions?: ReactNode, eyebrow?: ReactNode }): ReactNode {
  return (
    <div className='mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between'>
      <div className='max-w-2xl'>
        {eyebrow != null && <div className='mb-2'>{eyebrow}</div>}
        <h1 className='text-title'>{title}</h1>
        {subtitle != null && <p className='mt-2 text-muted'>{subtitle}</p>}
      </div>
      {actions != null && <div className='flex flex-wrap gap-2'>{actions}</div>}
    </div>
  )
}

export function SectionTitle ({ children, aside }: { children: ReactNode, aside?: ReactNode }): ReactNode {
  return (
    <div className='mb-3 flex items-center justify-between gap-3'>
      <h2 className='text-section'>{children}</h2>
      {aside}
    </div>
  )
}

export function KeyValue ({ label, children, hint, wide = false }: { label: ReactNode, children: ReactNode, hint?: ReactNode, wide?: boolean }): ReactNode {
  return (
    <div className={cn('flex flex-col gap-1 py-3', !wide && 'sm:flex-row sm:items-start sm:justify-between sm:gap-6')}>
      <dt className='shrink-0 text-small text-muted'>{label}</dt>
      <dd className={cn('min-w-0 text-left font-semibold [&_.font-mono]:text-small [&_.font-mono]:font-medium', !wide && 'sm:text-right')}>
        {children}
        {hint != null && <div className='text-small font-normal text-muted'>{hint}</div>}
      </dd>
    </div>
  )
}

export function KeyValueList ({ children }: { children: ReactNode }): ReactNode {
  return <dl className='divide-y divide-line/70'>{children}</dl>
}

type Tone = 'info' | 'success' | 'warning' | 'error'

const toneClasses: Record<Tone, string> = {
  info: 'bg-brand-soft text-fg border-brand/30',
  success: 'bg-mint-soft text-fg border-mint/60',
  warning: 'bg-orange-soft text-fg border-orange/40',
  error: 'bg-red-soft text-fg border-red/40'
}

const toneDot: Record<Tone, string> = {
  info: 'bg-brand',
  success: 'bg-mint',
  warning: 'bg-orange',
  error: 'bg-red'
}

export function Notice ({ tone = 'info', title, children, className }: { tone?: Tone, title?: ReactNode, children?: ReactNode, className?: string }): ReactNode {
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={cn('flex gap-3 rounded-2xl border px-4 py-3', toneClasses[tone], className)}>
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', toneDot[tone])} aria-hidden />
      <div className='min-w-0 text-small'>
        {title != null && <div className='font-bold'>{title}</div>}
        {children != null && <div className={cn(title != null && 'mt-0.5', 'text-muted [&_strong]:text-fg')}>{children}</div>}
      </div>
    </div>
  )
}

export function Stat ({ label, value, hint, accent = false }: { label: ReactNode, value: ReactNode, hint?: ReactNode, accent?: boolean }): ReactNode {
  return (
    <div className={cn('rounded-3xl p-5', accent ? 'bg-brand text-white' : 'bg-surface border border-line/60 shadow-card')}>
      <div className={cn('text-small', accent ? 'text-white/80' : 'text-muted')}>{label}</div>
      <div className='mt-1 text-[28px] leading-[34px] font-extrabold tracking-[-0.03em]'>{value}</div>
      {hint != null && <div className={cn('mt-1 text-small', accent ? 'text-white/80' : 'text-muted')}>{hint}</div>}
    </div>
  )
}

export function Spinner ({ className }: { className?: string }): ReactNode {
  return (
    <span
      role='status'
      aria-label='Loading'
      className={cn('inline-block size-5 animate-spin rounded-full border-2 border-brand/25 border-t-brand', className)}
    />
  )
}

export function Loading ({ label = 'Loading…' }: { label?: string }): ReactNode {
  return (
    <div className='flex items-center justify-center gap-3 py-16 text-muted'>
      <Spinner /> {label}
    </div>
  )
}

export function Skeleton ({ className }: { className?: string }): ReactNode {
  return <div className={cn('animate-pulse rounded-2xl bg-surface-2', className)} />
}

export function EmptyState ({ title, children, action }: { title: ReactNode, children?: ReactNode, action?: ReactNode }): ReactNode {
  return (
    <div className='flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-12 text-center'>
      <div className='text-lead font-bold'>{title}</div>
      {children != null && <p className='mt-1 max-w-md text-small text-muted'>{children}</p>}
      {action != null && <div className='mt-4'>{action}</div>}
    </div>
  )
}

export function Field ({ label, hint, error, children, htmlFor, optional }: {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  htmlFor?: string
  optional?: boolean
}): ReactNode {
  return (
    <div className='flex flex-col gap-1.5'>
      <label htmlFor={htmlFor} className='text-small font-bold'>
        {label}{optional === true && <span className='font-normal text-muted'> (optional)</span>}
      </label>
      {children}
      {error != null && error !== ''
        ? <div className='text-small text-red-ink'>{error}</div>
        : hint != null && <div className='text-small text-muted'>{hint}</div>}
    </div>
  )
}

/** Monospace block for hex, commands and other copyable machine text */
export function CodeBlock ({ children, className }: { children: ReactNode, className?: string }): ReactNode {
  return (
    <pre className={cn('max-h-40 overflow-auto rounded-2xl bg-surface-2 px-4 py-3 font-mono text-[12px] leading-5 break-all whitespace-pre-wrap', className)}>
      {children}
    </pre>
  )
}

export function Chip ({ active, children, onClick }: { active: boolean, children: ReactNode, onClick: () => void }): ReactNode {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-4 py-2 text-small font-semibold transition-colors',
        active ? 'bg-surface text-brand-ink shadow-card ring-1 ring-brand/20' : 'bg-surface-2 text-muted hover:text-fg'
      )}
    >
      {children}
    </button>
  )
}

export function Stars ({ value, size = 16 }: { value: number, size?: number }): ReactNode {
  return (
    <span className='inline-flex items-center gap-0.5' aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width={size} height={size} viewBox='0 0 20 20' aria-hidden>
          <path
            d='M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.8l-5.2 2.8 1-5.8L1.5 7.7l5.9-.9z'
            className={value >= i - 0.25 ? 'fill-orange' : value >= i - 0.75 ? 'fill-orange/50' : 'fill-line'}
          />
        </svg>
      ))}
    </span>
  )
}
