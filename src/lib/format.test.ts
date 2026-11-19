import { describe, expect, test } from 'vitest'
import { DUFFS_PER_DASH } from './consensus'
import { formatVotingPower } from './format'

const DASH = DUFFS_PER_DASH

describe('formatVotingPower', () => {
  test('one unit is 1,000 DASH of stake', () => {
    expect(formatVotingPower(1_000 * DASH)).toBe('1')
    expect(formatVotingPower(2_500 * DASH)).toBe('2.5')
    expect(formatVotingPower(40_000 * DASH)).toBe('40')
  })

  test('sub-unit stake keeps its decimals', () => {
    expect(formatVotingPower(200 * DASH)).toBe('0.2')
    expect(formatVotingPower(1_250 * DASH)).toBe('1.25')
    expect(formatVotingPower(0)).toBe('0')
  })
})