import { BLOCK_TIME_SECONDS, DUFFS_PER_DASH } from './consensus'
import type { Duffs } from './types'

/** 123456789 → "1.23456789". Trailing zeros are trimmed, and at least `minDecimals` are kept. */
export function duffsToDashString (duffs: Duffs, minDecimals = 0): string {
  const negative = duffs < 0
  const abs = Math.abs(duffs)
  const whole = Math.floor(abs / DUFFS_PER_DASH)
  const fraction = String(abs % DUFFS_PER_DASH).padStart(8, '0').replace(/0+$/, '').padEnd(minDecimals, '0')
  const wholeStr = whole.toLocaleString('en-US')
  return `${negative ? '-' : ''}${wholeStr}${fraction.length > 0 ? `.${fraction}` : ''}`
}

export function formatDash (duffs: Duffs): string {
  return `${duffsToDashString(duffs)} DASH`
}

/** Parses a user-entered DASH amount into duffs. Returns null for anything that isn't a valid amount. */
export function parseDash (input: string): Duffs | null {
  const value = input.trim().replace(/,/g, '')
  const match = /^(\d+)(?:\.(\d{0,8}))?$/.exec(value)
  if (match == null) return null
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(8, '0'))
  const duffs = whole * DUFFS_PER_DASH + fraction
  return Number.isSafeInteger(duffs) ? duffs : null
}

export function formatBasisPoints (bp: number): string {
  return `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
}

/** Approximate duration of a number of blocks, e.g. "~30 days" */
export function blocksToDuration (blocks: number): string {
  if (blocks <= 0) return 'none'
  const minutes = (blocks * BLOCK_TIME_SECONDS) / 60
  if (minutes < 60) return `~${Math.round(minutes)} min`
  const hours = minutes / 60
  if (hours < 48) return `~${Math.round(hours)} hours`
  const days = hours / 24
  if (days < 60) return `~${Math.round(days)} days`
  const months = days / 30.44
  if (months < 24) return `~${Math.round(months)} months`
  return `~${(days / 365.25).toFixed(1)} years`
}

const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function relativeTime (timestamp: number, now = Date.now()): string {
  const seconds = Math.round((timestamp - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return relativeFormat.format(seconds, 'second')
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return relativeFormat.format(Math.round(seconds / 3600), 'hour')
  if (abs < 86400 * 30) return relativeFormat.format(Math.round(seconds / 86400), 'day')
  if (abs < 86400 * 365) return relativeFormat.format(Math.round(seconds / (86400 * 30)), 'month')
  return relativeFormat.format(Math.round(seconds / (86400 * 365)), 'year')
}

export function formatDateTime (timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

/** "8uff2sddkV889RW5xgYYGP7GskCFdh5MN3opC3DLJnwF" → "8uff…JnwF" */
export function shortId (id: string, edge = 4): string {
  return id.length <= edge * 2 + 1 ? id : `${id.slice(0, edge)}…${id.slice(-edge)}`
}

export function pluralize (count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
