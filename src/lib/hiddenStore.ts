/*
 * Pools this browser hides from the grid. Client-side only, per origin and best effort, exactly like the
 * seen watermark: a blocked localStorage simply means nothing stays hidden after a reload.
 */

const KEY = 'dts:hidden:v1'

export function readHiddenPoolIds (): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

export function writeHiddenPoolIds (ids: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]))
  } catch {
    // Storage unavailable: the pool reappears on the next load
  }
}