import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { backendMode } from '../data'
import { clearSession, loadSession, saveSession, type AuthSession } from './authSession'
import { connectExtension, watchForExtension } from './extension'
import { findIdentityForKeys, parsePrivateKey } from './identity'
import { clearSignerKeyCache } from './privateKeySigner'

export type WalletStatus = 'disconnected' | 'connecting' | 'connected'

interface WalletContextValue {
  status: WalletStatus
  mode: AuthSession['mode'] | null
  /** Identity of the logged-in session */
  identity: string | null
  /** Identities the session can act as; private-key login always has exactly one */
  identities: string[]
  /** Mock sandbox only: act as a made-up identity to play the creator and each member */
  previewIdentity: string | null
  /** The identity the UI acts as: the session identity, or the preview identity in the mock sandbox */
  activeIdentity: string | null
  error: string | null
  loginOpen: boolean
  openLogin: () => void
  closeLogin: () => void
  loginWithPrivateKey: (authenticationKeyText: string, encryptionKeyText: string) => Promise<void>
  loginWithExtension: () => Promise<void>
  logout: () => void
  selectIdentity: (id: string) => void
  setPreviewIdentity: (id: string | null) => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

const PREVIEW_KEY = 'dts:preview-identity'
const LEGACY_CONNECTED_KEY = 'dts:wallet-connected'

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
  const [session, setSession] = useState<AuthSession | null>(() => loadSession())
  const [previewIdentity, setPreviewState] = useState<string | null>(() => readStorage(PREVIEW_KEY))
  const [status, setStatus] = useState<WalletStatus>(() => loadSession() == null ? 'disconnected' : 'connected')
  const [loginOpen, setLoginOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Reconnect an extension session after a reload; the extension's connect is idempotent once approved.
    if (loadSession()?.mode !== 'extension') return
    const stop = watchForExtension(() => {
      void connectExtension().then(info => {
        setSession(current => {
          if (current?.mode !== 'extension') return current
          const next: AuthSession = { ...current, identityId: info.currentIdentity, identities: info.identities }
          saveSession(next)
          return next
        })
        setStatus('connected')
        writeStorage(LEGACY_CONNECTED_KEY, '1')
      }).catch(() => {
        // Keep the saved session; a manual extension login can reconnect later
      })
    })
    return stop
  }, [])

  const openLogin = useCallback(() => {
    setError(null)
    setLoginOpen(true)
  }, [])

  const closeLogin = useCallback(() => setLoginOpen(false), [])

  const loginWithPrivateKey = useCallback(async (authenticationKeyText: string, encryptionKeyText: string) => {
    setError(null)
    setStatus('connecting')
    try {
      const authenticationKey = await parsePrivateKey(authenticationKeyText)
      const encryptionKey = await parsePrivateKey(encryptionKeyText)
      const found = await findIdentityForKeys(authenticationKey, encryptionKey)
      const next: AuthSession = {
        mode: 'privateKey',
        identityId: found.identityId,
        authKeyId: found.authKeyId,
        authKeyWif: authenticationKey.WIF(),
        encryptionKeyId: found.encryptionKeyId,
        encryptionKeyWif: encryptionKey.WIF()
      }
      saveSession(next)
      setSession(next)
      setStatus('connected')
      setLoginOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus(loadSession() == null ? 'disconnected' : 'connected')
      throw e
    }
  }, [])

  const loginWithExtension = useCallback(async () => {
    setError(null)
    setStatus('connecting')
    try {
      const info = await connectExtension()
      const next: AuthSession = { mode: 'extension', identityId: info.currentIdentity, identities: info.identities }
      saveSession(next)
      setSession(next)
      setStatus('connected')
      setLoginOpen(false)
      writeStorage(LEGACY_CONNECTED_KEY, '1')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus(loadSession() == null ? 'disconnected' : 'connected')
      throw e
    }
  }, [])

  const logout = useCallback(() => {
    clearSession()
    clearSignerKeyCache()
    setSession(null)
    setStatus('disconnected')
    setError(null)
    writeStorage(LEGACY_CONNECTED_KEY, null)
  }, [])

  const selectIdentity = useCallback((id: string) => {
    setSession(current => {
      if (current?.mode !== 'extension') return current
      const next: AuthSession = { ...current, identityId: id }
      saveSession(next)
      return next
    })
  }, [])

  const setPreviewIdentity = useCallback((id: string | null) => {
    setPreviewState(id)
    writeStorage(PREVIEW_KEY, id)
  }, [])

  const identity = session?.identityId ?? null
  const identities = session?.mode === 'extension'
    ? session.identities ?? (identity == null ? [] : [identity])
    : identity == null ? [] : [identity]

  const value = useMemo<WalletContextValue>(() => ({
    status,
    mode: session?.mode ?? null,
    identity,
    identities,
    previewIdentity,
    activeIdentity: backendMode() === 'mock' ? previewIdentity ?? identity : identity,
    error,
    loginOpen,
    openLogin,
    closeLogin,
    loginWithPrivateKey,
    loginWithExtension,
    logout,
    selectIdentity,
    setPreviewIdentity
  }), [
    status, session, identity, identities, previewIdentity, error, loginOpen, openLogin, closeLogin,
    loginWithPrivateKey, loginWithExtension, logout, selectIdentity, setPreviewIdentity
  ])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet (): WalletContextValue {
  const context = useContext(WalletContext)
  if (context == null) throw new Error('useWallet must be used inside WalletProvider')
  return context
}
