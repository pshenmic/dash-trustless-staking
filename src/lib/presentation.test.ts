import { describe, expect, test } from 'vitest'
import { earlyExitLabel, gridClass, operatorLabel, poolListTag, poolTile } from './presentation.js'
import type { Pool } from './types.js'

const pool = {
  operatorPubKey: '79a4b8c83f4c602745135fecc26dae628982c868a00d767f86f5e75eb8c61de6c7f93e37fcc35ad85a911bf8e3087be0',
  operatorReward: 500
} as Pool

describe('poolListTag', () => {
  test('an unlocked pool is Filling', () => {
    expect(poolListTag('NEW')).toEqual({ label: 'Filling', tone: 'orange' })
  })

  test('a locked pool is Filled', () => {
    expect(poolListTag('LOCKED')).toEqual({ label: 'Filled', tone: 'blue' })
  })
})

describe('earlyExitLabel', () => {
  test('no penalty reads Free exit', () => {
    expect(earlyExitLabel(0)).toBe('Free exit')
  })

  test('a real penalty keeps its amount', () => {
    expect(earlyExitLabel(50_000_000)).toBe('0.5 DASH exit')
  })
})

describe('operatorLabel', () => {
  test('a listed provider is named', () => {
    expect(operatorLabel(pool).name).toBe('pshenmic.dev')
  })

  test('an unknown key falls back to the short key, never undefined', () => {
    expect(operatorLabel({ ...pool, operatorPubKey: 'ab'.repeat(48) }).name).toBe('abababab')
  })

  test('the fee comes from the pool, not the provider list', () => {
    expect(operatorLabel({ ...pool, operatorReward: 750 }).fee).toBe('7.5%')
  })
})

describe('poolTile', () => {
  test('initials come from the words, at most two', () => {
    expect(poolTile("Hamster's Pool", 'a').initials).toBe('HP')
  })

  test('a one-word name uses two letters', () => {
    expect(poolTile('node', 'a').initials).toBe('NO')
  })

  test('the gradient is deterministic per id', () => {
    expect(poolTile('x', 'abc').background).toBe(poolTile('x', 'abc').background)
  })

  test('the gradient is a two-stop css gradient', () => {
    expect(poolTile('x', 'abc').background).toMatch(/^linear-gradient\(135deg, hsl\(\d+ 85% 55%\), hsl\(\d+ 85% 45%\)\)$/)
  })
})

describe('gridClass', () => {
  test('auto follows the breakpoints', () => {
    expect(gridClass('auto')).toBe('grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4')
  })

  test('a fixed density overrides them', () => {
    expect(gridClass(2)).toBe('grid-cols-1 sm:grid-cols-2')
  })

  test('four columns at every wide width', () => {
    expect(gridClass(4)).toBe('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4')
  })
})