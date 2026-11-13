import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { GridDensity } from './presentation'
import type { Network } from './types'

export interface Settings {
  network: Network
  /** Custom DAPI addresses (host:port); empty means the SDK's default seed list */
  dapiEndpoints: string[]
  /** Identities the pool creator doesn't want to select. Kept in this browser only. */
  banList: string[]
  /** Pools-grid density; 'auto' follows the breakpoints */
  grid: GridDensity
}

const DEFAULTS: Settings = { network: 'testnet', dapiEndpoints: [], banList: [], grid: 'auto' }
const STORAGE_KEY = 'dts:settings'

function load (): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw == null ? DEFAULTS : { ...DEFAULTS, ...JSON.parse(raw) as Partial<Settings> }
  } catch {
    return DEFAULTS
  }
}

interface SettingsContextValue {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  toggleBan: (identity: string) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider ({ children }: { children: ReactNode }): ReactNode {
  const [settings, setSettings] = useState<Settings>(load)

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(previous => {
      const next = { ...previous, ...patch }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Storage unavailable: settings last for this page only
      }
      return next
    })
  }, [])

  const toggleBan = useCallback((identity: string) => {
    setSettings(previous => {
      const banList = previous.banList.includes(identity)
        ? previous.banList.filter(id => id !== identity)
        : [...previous.banList, identity]
      const next = { ...previous, banList }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Storage unavailable
      }
      return next
    })
  }, [])

  const value = useMemo(() => ({ settings, update, toggleBan }), [settings, update, toggleBan])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings (): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (context == null) throw new Error('useSettings must be used inside SettingsProvider')
  return context
}
