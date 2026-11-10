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
    vi.stubGlobal('localStorage', fakeStorage())
    clearSession()
  })

  test('round-trips a private-key session through storage and the cache', () => {
    saveSession(session)
    expect(loadSession()).toEqual(session)
    expect(currentSession()).toEqual(session)
  })

  test('round-trips an extension session', () => {
    const extension: AuthSession = { mode: 'extension', identityId: 'identity' }
    saveSession(extension)
    expect(loadSession()).toEqual(extension)
  })

  test('clears the session from storage and the cache', () => {
    saveSession(session)
    clearSession()
    expect(loadSession()).toBeNull()
    expect(currentSession()).toBeNull()
    expect(localStorage.getItem('dts:auth')).toBeNull()
  })

  test('returns null for malformed JSON', () => {
    clearSession()
    localStorage.setItem('dts:auth', '{')
    expect(loadSession()).toBeNull()
  })

  test('returns null for a private-key session missing a key', () => {
    clearSession()
    localStorage.setItem('dts:auth', JSON.stringify({ mode: 'privateKey', identityId: 'id', authKeyId: 0, authKeyWif: 'cV1' }))
    expect(loadSession()).toBeNull()
  })

  test('returns null for an unknown mode', () => {
    clearSession()
    localStorage.setItem('dts:auth', JSON.stringify({ mode: 'something', identityId: 'id' }))
    expect(loadSession()).toBeNull()
  })

  test('keeps the session in memory when storage writes fail', () => {
    vi.stubGlobal('localStorage', {
      ...fakeStorage(),
      setItem: () => { throw new Error('quota') }
    })
    saveSession(session)
    expect(currentSession()).toEqual(session)
  })
})