import { beforeEach, describe, expect, test, vi } from 'vitest'
import { readHiddenPoolIds, writeHiddenPoolIds } from './hiddenStore'

const data = new Map<string, string>()
const storage: Storage = {
  get length () { return data.size },
  clear: () => data.clear(),
  getItem: key => data.get(key) ?? null,
  key: index => [...data.keys()][index] ?? null,
  removeItem: key => { data.delete(key) },
  setItem: (key, value) => { data.set(key, value) }
}

describe('hiddenStore', () => {
  beforeEach(() => {
    data.clear()
    vi.stubGlobal('localStorage', storage)
  })

  test('nothing hidden by default', () => {
    expect(readHiddenPoolIds()).toEqual(new Set())
  })

  test('hidden ids survive a write and read back as a set', () => {
    writeHiddenPoolIds(new Set(['pool-a', 'pool-b']))
    expect(readHiddenPoolIds()).toEqual(new Set(['pool-a', 'pool-b']))
  })

  test('unhiding removes only that pool', () => {
    writeHiddenPoolIds(new Set(['pool-a', 'pool-b']))
    const next = readHiddenPoolIds()
    next.delete('pool-a')
    writeHiddenPoolIds(next)
    expect(readHiddenPoolIds()).toEqual(new Set(['pool-b']))
  })

  test('unreadable storage means nothing is hidden, not a crash', () => {
    data.set('dts:hidden:v1', '{not json')
    expect(readHiddenPoolIds()).toEqual(new Set())
  })

  test('a payload that is not a list is ignored', () => {
    data.set('dts:hidden:v1', '{"pool-a":true}')
    expect(readHiddenPoolIds()).toEqual(new Set())
  })

  test('non-string entries are dropped', () => {
    data.set('dts:hidden:v1', '["pool-a", 7, null]')
    expect(readHiddenPoolIds()).toEqual(new Set(['pool-a']))
  })
})