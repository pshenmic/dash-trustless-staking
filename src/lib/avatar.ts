/*
 * Generated pool avatars: the pool name's first character on a background derived from its hash.
 * No bytes go on Platform, the result is stable across devices, and every hue clears WCAG AA for a
 * white letter at this saturation/lightness (measured min 5.28:1 over 36 hues).
 */

const SATURATION = 45
const LIGHTNESS = 30

/** FNV-1a over UTF-8 code units — small, stable, dependency-free */
function hash32 (value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** First grapheme of the name, upper-cased only when that keeps it a single character; '?' when empty */
export function poolInitial (name: string, fallback = '?'): string {
  const trimmed = name.trim()
  if (trimmed === '') return fallback
  const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : null
  const first = segmenter != null
    ? [...segmenter.segment(trimmed)][0]?.segment
    : Array.from(trimmed)[0]
  if (first == null) return fallback
  const upper = first.toUpperCase()
  return Array.from(upper).length === 1 ? upper : first
}

export function poolAvatarColor (seed: string): { background: string, foreground: string } {
  return {
    background: `hsl(${hash32(seed) % 360} ${SATURATION}% ${LIGHTNESS}%)`,
    foreground: '#ffffff'
  }
}