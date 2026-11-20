import { describe, expect, test } from 'vitest'
import { changesSince, snapshotNow, type PoolSnapshot } from './seen'

const base: PoolSnapshot = { at: 1_000, status: 'SIGNING', consents: 2, fundings: 2, members: 3 }

describe('changesSince', () => {
  test('a first visit has no changes to report', () => {
    expect(changesSince(null, { status: 'SIGNING', consents: 2, fundings: 2, members: 3 })).toBeNull()
  })

  test('nothing moved → null', () => {
    expect(changesSince(base, { status: 'SIGNING', consents: 2, fundings: 2, members: 3 })).toBeNull()
  })

  test('a status change alone is enough to report', () => {
    expect(changesSince(base, { status: 'FORMED', consents: 2, fundings: 2, members: 3 })).toEqual({
      since: 1_000, statusFrom: 'SIGNING', statusTo: 'FORMED', consents: 0, fundings: 0, members: 0
    })
  })

  test('counts are deltas against the snapshot, not totals', () => {
    expect(changesSince(base, { status: 'SIGNING', consents: 5, fundings: 3, members: 4 })).toEqual({
      since: 1_000, statusFrom: null, statusTo: 'SIGNING', consents: 3, fundings: 1, members: 1
    })
  })

  test('a shrinking count never reports a negative delta', () => {
    // Cannot happen with append-only documents, but a corrupted or older snapshot must not show "-1 new"
    expect(changesSince({ ...base, consents: 9 }, { status: 'SIGNING', consents: 2, fundings: 2, members: 3 })).toBeNull()
  })

  test('status and counters combine in one report', () => {
    const changes = changesSince(base, { status: 'ERROR', consents: 2, fundings: 3, members: 3 })
    expect(changes).toMatchObject({ statusFrom: 'SIGNING', statusTo: 'ERROR', consents: 0, fundings: 1, members: 0 })
  })
})

describe('snapshotNow', () => {
  test('stores the seen state with a timestamp', () => {
    expect(snapshotNow({ status: 'FORMED', consents: 2, fundings: 2, members: 3 }, 42)).toEqual({
      at: 42, status: 'FORMED', consents: 2, fundings: 2, members: 3
    })
  })
})