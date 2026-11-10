import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { connectExtension, watchForExtension } from './extension'

export type WalletStatus = 'checking' | 'unavailable' | 'disconnected' | 'connecting' | 'connected'

interface WalletContextValue {
  status: WalletStatus
  /** Identity connected through the extension */
  identity: string | null
  identities: string[]
  /** Mock sandbox only: act as a made-up identity to play the creator and each member */
  previewIdentity: string | null
  /** The identity the UI acts as: the preview identity if set, otherwise the connected one */
  activeIdentity: string | null
  error: string | null
  connect: () => Promise<void>
  disconnect: () => void
  /** Act as another identity of the connected wallet */
  selectIdentity: (id: string) => void
  setPreviewIdentity: (id: string | null) => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

const CONNECTED_KEY = 'dts:wallet-connected'
const PREVIEW_KEY = 'dts:preview-identity'
/** How long to wait for the extension before showing "Get extension" */
const UNAVAILABLE_AFTER_MS = 4000

function readStorage (key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage (key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the setting lasts for this page only
  }
}

export function WalletProvider ({ children }: { children: ReactNode }): ReactNode {
  const [status, setStatus] = useState<WalletStatus>('checking')
  const [identity, setIdentity] = useState<string | null>(null)
  const [identities, setIdentities] = useState<string[]>([])
  const [previewIdentity, setPreviewState] = useState<string | null>(() => readStorage(PREVIEW_KEY))
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async () => {
    setError(null)
    setStatus('connecting')
    try {
      const info = await connectExtension()
      setIdentity(info.currentIdentity)
      setIdentities(info.identities)
      setStatus('connected')
      writeStorage(CONNECTED_KEY, '1')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus(window.dashPlatformExtension == null ? 'unavailable' : 'disconnected')
    }
  }, [])

  const disconnect = useCallback(() => {
    // The extension has no disconnect call; forget the identity here and stop auto-reconnecting
    setIdentity(null)
    setIdentities([])
    setStatus('disconnected')
    writeStorage(CONNECTED_KEY, null)
  }, [])

  const selectIdentity = useCallback((id: string) => {
    setIdentity(current => identities.includes(id) ? id : current)
  }, [identities])

  const setPreviewIdentity = useCallback((id: string | null) => {
    setPreviewState(id)
    writeStorage(PREVIEW_KEY, id)
  }, [])

  useEffect(() => {
    // Until the bridge shows up the status is "checking"; after a few seconds assume it isn't installed,
    // but keep watching so a slow or late extension still flips the button to Connect
    const giveUp = setTimeout(() => setStatus(current => current === 'checking' ? 'unavailable' : current), UNAVAILABLE_AFTER_MS)
    const stop = watchForExtension(() => {
      clearTimeout(giveUp)
      setStatus('disconnected')
      // An app the user already approved reconnects without a popup
      if (readStorage(CONNECTED_KEY) === '1') void connect()
    })
    return () => {
      clearTimeout(giveUp)
      stop()
    }
  }, [connect])

  const value = useMemo<WalletContextValue>(() => ({
    status,
    identity,
    identities,
    previewIdentity,
    activeIdentity: previewIdentity ?? identity,
    error,
    connect,
    disconnect,
    selectIdentity,
    setPreviewIdentity
  }), [status, identity, identities, previewIdentity, error, connect, disconnect, selectIdentity, setPreviewIdentity])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet (): WalletContextValue {
  const context = useContext(WalletContext)
  if (context == null) throw new Error('useWallet must be used inside WalletProvider')
  return context
}
