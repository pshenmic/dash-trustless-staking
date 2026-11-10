export type AuthSession =
  | {
    mode: 'privateKey'
    identityId: string
    authKeyId: number
    authKeyWif: string
    encryptionKeyId: number
    encryptionKeyWif: string
  }
  | { mode: 'extension', identityId: string }

const STORAGE_KEY = 'dts:auth'

let cache: AuthSession | null | undefined

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parse (raw: string | null): AuthSession | null {
  if (raw == null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || typeof value.identityId !== 'string') return null
    if (value.mode === 'extension') return { mode: 'extension', identityId: value.identityId }
    if (value.mode !== 'privateKey') return null
    if (
      typeof value.authKeyId !== 'number' ||
      typeof value.authKeyWif !== 'string' ||
      typeof value.encryptionKeyId !== 'number' ||
      typeof value.encryptionKeyWif !== 'string'
    ) return null
    return {
      mode: 'privateKey',
      identityId: value.identityId,
      authKeyId: value.authKeyId,
      authKeyWif: value.authKeyWif,
      encryptionKeyId: value.encryptionKeyId,
      encryptionKeyWif: value.encryptionKeyWif
    }
  } catch {
    return null
  }
}

export function loadSession (): AuthSession | null {
  if (cache !== undefined) return cache
  try {
    cache = parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    cache = null
  }
  return cache
}

export function currentSession (): AuthSession | null {
  return loadSession()
}

export function saveSession (session: AuthSession): void {
  cache = session
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Storage unavailable: the session lasts for this page only
  }
}

export function clearSession (): void {
  cache = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable
  }
}