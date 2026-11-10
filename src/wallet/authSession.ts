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

function read (which: 'session' | 'local'): string | null {
  try {
    return (which === 'session' ? sessionStorage : localStorage).getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function write (which: 'session' | 'local', value: string): void {
  try {
    (which === 'session' ? sessionStorage : localStorage).setItem(STORAGE_KEY, value)
  } catch {
    // Storage unavailable
  }
}

function remove (which: 'session' | 'local'): void {
  try {
    (which === 'session' ? sessionStorage : localStorage).removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable
  }
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
  // A null cache means "no session yet or logged out": re-read storage so a session written by an
  // earlier module instance (or a test fixture) is still picked up.
  if (cache != null) return cache
  let raw = read('session')
  if (raw == null) {
    // One-time migration: earlier builds kept the session (and its keys) in localStorage
    const legacy = read('local')
    if (legacy != null) {
      raw = legacy
      write('session', legacy)
      remove('local')
    }
  }
  cache = parse(raw)
  if (cache == null && raw != null) remove('session')
  return cache
}

export function currentSession (): AuthSession | null {
  return loadSession()
}

export function saveSession (session: AuthSession): void {
  cache = session
  write('session', JSON.stringify(session))
  // The keys never outlive the browser session
  remove('local')
}

export function clearSession (): void {
  cache = null
  remove('session')
  remove('local')
}