import { useCallback, useEffect, useRef } from 'react'
import { snapshotNow, type PoolSnapshot } from '../lib/seen'
import { readSeen, writeSeen } from '../lib/seenStore'

/** At most one write every two seconds; the last state wins because each write rewrites the entry */
const WRITE_INTERVAL_MS = 2_000

export interface SeenHandle {
  /** The snapshot captured when this pool page opened; null on a first visit */
  lastSeen: PoolSnapshot | null
  /** Record the state currently on screen as seen (throttled) */
  markSeen: (now: Omit<PoolSnapshot, 'at'>) => void
}

export function useSeen (poolId: string): SeenHandle {
  // Captured once per pool id so the diff against "last visit" is stable while the page is open
  const capture = useRef<{ poolId: string, lastSeen: PoolSnapshot | null } | null>(null)
  if (capture.current?.poolId !== poolId) capture.current = { poolId, lastSeen: readSeen(poolId) }

  const pending = useRef<{ poolId: string, snapshot: PoolSnapshot } | null>(null)
  const lastWrite = useRef<Record<string, number>>({})

  const flush = useCallback((): void => {
    const item = pending.current
    if (item == null || item.snapshot.at <= (lastWrite.current[item.poolId] ?? 0)) return
    writeSeen(item.poolId, item.snapshot)
    lastWrite.current[item.poolId] = item.snapshot.at
  }, [])

  const markSeen = useCallback((now: Omit<PoolSnapshot, 'at'>): void => {
    pending.current = { poolId, snapshot: snapshotNow(now) }
    if (pending.current.snapshot.at - (lastWrite.current[poolId] ?? 0) >= WRITE_INTERVAL_MS) flush()
  }, [flush, poolId])

  useEffect(() => {
    const hide = (): void => flush()
    window.addEventListener('pagehide', hide)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('pagehide', hide)
      document.removeEventListener('visibilitychange', hide)
      flush()
    }
  }, [flush])

  return { lastSeen: capture.current.lastSeen, markSeen }
}