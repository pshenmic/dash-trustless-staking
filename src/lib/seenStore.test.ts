import { beforeEach, describe, expect, test, vi } from 'vitest'
import { readSeen, seenSnapshots, writeSeen } from './seenStore'

const data = new Map<string, string>()
const storage: Storage = {
  get length () { return data.size },
  clear: () => data.clear(),
  getItem: key => data.get(key) ?? null,
  key: index => [...data.keys()][index] ?? null,
  removeItem: key => { data.delete(key) },
  setItem: (key, value) => { data.set(key, value) }
}

const snapshot = { at: 1_000, status: 'FORMED' as const, consents: 5, fundings: 5, members: 5 }

describe('seenStore', () => {
  beforeEach(() => {
    data.clear()
    vi.stubGlobal('localStorage', storage)
  })

  test('a browser that has opened nothing remembers nothing', () => {
    // First visit: every pool in the grid counts as changed
    expect(seenSnapshots()).toEqual({})
  })

  test('a visited pool is remembered with its snapshot', () => {
    writeSeen('pool-a', snapshot)
    expect(readSeen('pool-a')).toEqual(snapshot)
    expect(seenSnapshots()).toEqual({ 'pool-a': snapshot })
  })

  test('unreadable storage hides the marks instead of throwing', () => {
    data.set('dts:seen:v1', '{not json')
    expect(seenSnapshots()).toEqual({})
    expect(readSeen('pool-a')).toBeNull()
  })

  test('an entry without a timestamp is not a visit', () => {
    // A hand-edited or older payload must not compare against garbage
    data.set('dts:seen:v1', JSON.stringify({ 'pool-a': { status: 'NEW' }, 'pool-b': snapshot }))
    expect(Object.keys(seenSnapshots())).toEqual(['pool-b'])
    expect(readSeen('pool-a')).toBeNull()
  })
})