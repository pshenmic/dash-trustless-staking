import { describe, expect, test } from 'vitest'
import { isNewPool, NEW_POOL_MS } from './recency'

const now = 1_800_000_000_000

describe('isNewPool', () => {
  test('a pool created a minute ago is new', () => {
    expect(isNewPool(now - 60_000, now)).toBe(true)
  })

  test('the pill survives right up to the seventh day', () => {
    expect(isNewPool(now - NEW_POOL_MS + 1, now)).toBe(true)
  })

  test('a week-old pool is no longer new', () => {
    expect(isNewPool(now - NEW_POOL_MS, now)).toBe(false)
  })

  test('an old pool stays old', () => {
    expect(isNewPool(now - 400 * 24 * 60 * 60 * 1000, now)).toBe(false)
  })
})