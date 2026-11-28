import type { ReactNode } from 'react'

/**
 * A small mark for a page that could not read something it wanted — an optional index, a chain read —
 * so what it shows may be incomplete. Passive by design: it never blocks an action, and it disappears
 * when every source answered.
 */
export function DataWarning ({ gaps, className }: { gaps: string[], className?: string }): ReactNode {
  if (gaps.length === 0) return null

  const text = 'Some data could not be loaded and the data may be inaccurate.'

  return (
    <span
      className={`group relative inline-flex ${className ?? ''}`}
      tabIndex={0}
      role='note'
      aria-label={`${text} ${gaps.join(' ')}`}
    >
      <span
        className='flex size-5 cursor-help items-center justify-center rounded-full bg-orange text-[11px] leading-none font-black text-white'
        aria-hidden
      >
        !
      </span>
      <span className='pointer-events-none absolute top-full left-1/2 z-50 mt-2 hidden w-64 -translate-x-1/2 rounded-xl bg-midnight px-3 py-2 text-tag leading-relaxed text-white shadow-lg group-hover:block group-focus:block'>
        <span className='block font-bold'>Incomplete data</span>
        {text}
        {gaps.map(gap => (
          <span key={gap} className='mt-1 block text-white/70'>{gap}</span>
        ))}
      </span>
    </span>
  )
}