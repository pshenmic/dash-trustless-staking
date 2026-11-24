import { describe, expect, test } from 'vitest'
import { annualisedApy, coinbasePayouts, formatApy, median, networkBenchmark, type DashscanAddressTx } from './economics'
import { DUFFS_PER_DASH } from './consensus'

const DASH = DUFFS_PER_DASH
const ADDRESS = 'yRewardAddress'
const since = Date.parse('2026-11-01T00:00:00.000Z')

const tx = (type: string, timestamp: string, outputs: Array<{ address?: string, value: number }>): DashscanAddressTx => ({
  type,
  timestamp,
  vOut: outputs
})

describe('coinbasePayouts', () => {
  test('sums coinbase outputs paid to the address inside the window', () => {
    const transactions = [
      tx('COINBASE', '2026-11-10T00:00:00.000Z', [{ address: ADDRESS, value: 2 * DASH }, { address: 'other', value: 5 * DASH }]),
      tx('COINBASE', '2026-11-20T00:00:00.000Z', [{ address: ADDRESS, value: 3 * DASH }]),
      // outside the window
      tx('COINBASE', '2026-10-20T00:00:00.000Z', [{ address: ADDRESS, value: 9 * DASH }]),
      // not a coinbase transaction
      tx('CLASSIC', '2026-11-15T00:00:00.000Z', [{ address: ADDRESS, value: 7 * DASH }]),
      // coinbase paying someone else
      tx('COINBASE', '2026-11-16T00:00:00.000Z', [{ address: 'other', value: 4 * DASH }])
    ]
    const payouts = coinbasePayouts(transactions, ADDRESS, since)
    expect(payouts.total).toBe(5 * DASH)
    expect(payouts.count).toBe(2)
    expect(payouts.firstAt).toBe(Date.parse('2026-11-10T00:00:00.000Z'))
    expect(payouts.lastAt).toBe(Date.parse('2026-11-20T00:00:00.000Z'))
  })

  test('no payouts reads as zero, not as an error', () => {
    expect(coinbasePayouts([], ADDRESS, since)).toEqual({ total: 0, count: 0, firstAt: null, lastAt: null })
  })
})

describe('annualisedApy', () => {
  test('annualises a window of earnings against the collateral', () => {
    // 10 DASH in 30 days on 1,000 DASH is 12.17% a year
    expect(annualisedApy(10 * DASH, 1000 * DASH, 30)).toBeCloseTo(12.1667, 3)
  })

  test('refuses a window with no days', () => {
    expect(annualisedApy(10 * DASH, 1000 * DASH, 0)).toBeNull()
    expect(annualisedApy(10 * DASH, 0, 30)).toBeNull()
  })
})

describe('median', () => {
  test('odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe('networkBenchmark', () => {
  test('medians the per-node daily reward and annualises it on 1,000 DASH', () => {
    const perNode = [
      { rewards: 30 * DASH, days: 30 }, // 1 DASH/day
      { rewards: 15 * DASH, days: 30 }, // 0.5
      { rewards: 45 * DASH, days: 30 } // 1.5
    ]
    const benchmark = networkBenchmark(perNode, 1000 * DASH)
    expect(benchmark.sample).toBe(3)
    expect(benchmark.medianDaily).toBe(1 * DASH)
    // 1 DASH/day on 1,000 DASH is 36.5% a year
    expect(benchmark.apy).toBeCloseTo(36.5, 2)
  })

  test('an empty sample has no benchmark', () => {
    expect(networkBenchmark([], 1000 * DASH)).toEqual({ sample: 0, medianDaily: null, apy: null })
  })
})

describe('formatApy', () => {
  test('keeps "no data" distinct from zero', () => {
    expect(formatApy(null)).toBe('—')
    expect(formatApy(0)).toBe('0%')
    expect(formatApy(12.1667)).toBe('12.2%')
    expect(formatApy(36.5)).toBe('36.5%')
  })
})