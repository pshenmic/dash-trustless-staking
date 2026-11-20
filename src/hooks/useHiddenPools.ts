import { useCallback, useState } from 'react'
import { readHiddenPoolIds, writeHiddenPoolIds } from '../lib/hiddenStore'

export interface HiddenPools {
  hidden: Set<string>
  toggleHidden: (poolId: string) => void
}

/** Pools hidden on this browser, shared by every grid that offers the action */
export function useHiddenPools (): HiddenPools {
  const [hidden, setHidden] = useState<Set<string>>(() => readHiddenPoolIds())

  const toggleHidden = useCallback((poolId: string): void => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(poolId)) next.delete(poolId)
      else next.add(poolId)
      writeHiddenPoolIds(next)
      return next
    })
  }, [])

  return { hidden, toggleHidden }
}