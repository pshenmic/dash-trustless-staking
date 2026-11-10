import { beforeEach, describe, expect, test, vi } from 'vitest'
import { clearSession, currentSession, loadSession, saveSession, type AuthSession } from './authSession'

function fakeStorage (): Storage {
  const data = new Map<string, string>()
  return {
    get length () { return data.size },
    clear: () => data.clear(),
    getItem: key => data.get(key) ?? null,
    key: index => [...data.keys()][index] ?? null,
    removeItem: key => { data.delete(key) },
    setItem: (key, value) => { data.set(key, value) }
  }
}

const session: AuthSession = {
  mode: 'privateKey',
  identityId: '6ZmHmFzbEb5SFJYg4QUhqBN3xTa2rDU3ywZ2Q149T1jF',
  authKeyId: 0,
  authKeyWif: 'cV1',
  encryptionKeyId: 2,
  encryptionKeyWif: 'cV2'
}

describe('authSession', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', fakeStorage())
    vi.stubGlobal('localStorage', fakeStorage())
    clearSession()
  })

  test('round-trips a private-key session through sessionStorage and the cache', () => {
    saveSession(session)
    expect(sessionStorage.getItem('dts:auth')).toBe(JSON.stringify(session))
    expect(localStorage.getItem('dts:auth')).toBeNull()
    expect(loadSession()).toEqual(session)
    expect(currentSession()).toEqual(session)
  })

  test('round-trips an extension session', () => {
    const extension: AuthSession = { mode: 'extension', identityId: 'identity' }
    saveSession(extension)
    expect(loadSession()).toEqual(extension)
  })

  test('migrates a legacy localStorage session into sessionStorage once', () => {
    localStorage.setItem('dts:auth', JSON.stringify(session))
    expect(loadSession()).toEqual(session)
    expect(sessionStorage.getItem('dts:auth')).toBe(JSON.stringify(session))
    expect(localStorage.getItem('dts:auth')).toBeNull()
  })

  test('clears the session from both storages and the cache', () => {
    saveSession(session)
    localStorage.setItem('dts:auth', 'legacy')
    clearSession()
    expect(loadSession()).toBeNull()
    expect(currentSession()).toBeNull()
    expect(sessionStorage.getItem('dts:auth')).toBeNull()
    expect(localStorage.getItem('dts:auth')).toBeNull()
  })

  test('returns null for malformed JSON', () => {
    sessionStorage.setItem('dts:auth', '{')
    expect(loadSession()).toBeNull()
    expect(sessionStorage.getItem('dts:auth')).toBeNull()
  })

  test('returns null for a private-key session missing a key', () => {
    sessionStorage.setItem('dts:auth', JSON.stringify({ mode: 'privateKey', identityId: 'id', authKeyId: 0, authKeyWif: 'cV1' }))
    expect(loadSession()).toBeNull()
  })

  test('returns null for an unknown mode', () => {
    sessionStorage.setItem('dts:auth', JSON.stringify({ mode: 'something', identityId: 'id' }))
    expect(loadSession()).toBeNull()
  })

  test('keeps the session in memory when storage writes fail', () => {
    vi.stubGlobal('sessionStorage', {
      ...fakeStorage(),
      setItem: () => { throw new Error('quota') }
    })
    saveSession(session)
    expect(currentSession()).toEqual(session)
    expect(localStorage.getItem('dts:auth')).toBeNull()
  })
})