/*
 * Mock-only avatar storage: the contract has no avatar document type yet, so the sandbox keeps them in
 * localStorage to exercise the real PoolAvatar rendering path. Nothing here survives into the live
 * backend — delete this module together with the mock sandbox.
 */

const KEY = 'dts:mock-avatars'

const listeners = new Set<() => void>()
let snapshot: Record<string, string> | null = null

function read (): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return parsed != null && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}

/** Stable snapshot for useSyncExternalStore — a fresh object per read would loop forever */
export function getMockAvatars (): Record<string, string> {
  if (snapshot == null) snapshot = read()
  return snapshot
}

export function getMockAvatar (poolId: string): string | undefined {
  return getMockAvatars()[poolId]
}

export function setMockAvatar (poolId: string, dataUrl: string | null): void {
  const next = { ...getMockAvatars() }
  if (dataUrl == null) delete next[poolId]
  else next[poolId] = dataUrl
  snapshot = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: keep the in-memory value for this tab
  }
  for (const listener of listeners) listener()
}

export function subscribeMockAvatars (listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}