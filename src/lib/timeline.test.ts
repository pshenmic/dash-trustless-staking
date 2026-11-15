import { describe, expect, it } from 'vitest'
import { compareFeed } from './timeline'

describe('compareFeed', () => {
  it('orders entries oldest first', () => {
    const rows = [{ at: 3_000 }, { at: 1_000 }, { at: 2_000 }]
    expect(rows.sort(compareFeed).map(r => r.at)).toEqual([1_000, 2_000, 3_000])
  })

  it('puts entries without a timestamp last', () => {
    const rows = [{ at: null }, { at: 2_000 }, { at: null }, { at: 1_000 }]
    expect(rows.sort(compareFeed).map(r => r.at)).toEqual([1_000, 2_000, null, null])
  })

  it('leaves equal and untimed entries in insertion order', () => {
    const rows = [{ at: 1_000, label: 'event' }, { at: 1_000, label: 'message' }, { at: null, label: 'registered' }, { at: null, label: 'dissolved' }]
    expect(rows.sort(compareFeed).map(r => r.label)).toEqual(['event', 'message', 'registered', 'dissolved'])
  })
})