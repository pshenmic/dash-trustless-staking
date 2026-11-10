import { useEffect, useState, type ReactNode } from 'react'
import type { Pool } from '../lib/types'
import { findProvider } from '../operators'
import { cn } from './ui'

// Every flag is its own small asset, fetched only when shown. Bundled with the app: no CDN.
const FLAGS = import.meta.glob<string>('../../node_modules/country-flag-icons/3x2/*.svg', { query: '?url', import: 'default' })

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

export function countryName (code: string): string {
  try {
    return regionNames.of(code.toUpperCase()) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

/**
 * Only third-party operator pools carry a location. A pool with a country, or on a listed operator's
 * key, has one (absent country = worldwide); a custom-operator pool has none to show.
 */
export function hasLocation (pool: Pool): boolean {
  return pool.location != null || findProvider(pool.operatorPubKey) != null
}

/** "Frankfurt, Germany", just "Singapore" when city and country match, "Worldwide" without a country */
export function locationText (country?: string | null, city?: string | null): string {
  if (country == null || country === '') return city != null && city !== '' ? city : 'Worldwide'
  const name = countryName(country)
  if (city == null || city === '' || city.trim().toLowerCase() === name.toLowerCase()) return name
  return `${city}, ${name}`
}

/** Country flag from an ISO 3166-1 alpha-2 code; a globe when there is no country (worldwide) */
export function Flag ({ country, className }: { country?: string | null, className?: string }): ReactNode {
  const [url, setUrl] = useState<string | null>(null)
  const code = (country ?? '').toUpperCase()

  useEffect(() => {
    let cancelled = false
    if (code === '') return
    const load = FLAGS[`../../node_modules/country-flag-icons/3x2/${code}.svg`]
    if (load == null) return
    void load().then(u => { if (!cancelled) setUrl(u) })
    return () => { cancelled = true }
  }, [code])

  if (code === '') {
    return (
      <span className={cn('inline-flex h-3.5 w-[21px] shrink-0 items-center justify-center text-brand-ink', className)} role='img' aria-label='Worldwide'>
        <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' aria-hidden>
          <circle cx='12' cy='12' r='9' />
          <path d='M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z' />
        </svg>
      </span>
    )
  }

  return (
    <span className={cn('inline-block h-3.5 w-[21px] shrink-0 overflow-hidden rounded-[3px] bg-surface-2 ring-1 ring-line/60', className)}>
      {url != null && <img src={url} alt={countryName(code)} className='block size-full object-cover' />}
    </span>
  )
}
