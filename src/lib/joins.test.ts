import { base58 } from '@scure/base'
import { describe, expect, test } from 'vitest'
import { latestJoins } from './joins'
import type { Join } from './types'

const idOf = (first: number): string => base58.encode(Uint8Array.from({ length: 32 }, (_, i) => i === 0 ? first : 0))

const join = (ownerId: string, createdAt: number, over: Partial<Join> = {}): Join => ({
  id: idOf(1),
  ownerId,
  createdAt,
  poolId: 'pool',
  amount: 100_000_000,
  ownerAddress: `yOwner-${ownerId}`,
  refundAddress: `yRefund-${ownerId}`,
  inputs: [],
  changeAddress: `yChange-${ownerId}`,
  ...over
})

describe('latestJoins', () => {
  test('a later join replaces the earlier one for the same identity', () => {
    const older = join('A', 1, { id: idOf(1), amount: 400_000_000 })
    const newer = join('A', 2, { id: idOf(2), amount: 700_000_000 })
    expect(latestJoins([older, newer])).toEqual([newer])
  })

  test('two identities keep one join each', () => {
    const a = join('A', 1, { id: idOf(1) })
    const b = join('B', 2, { id: idOf(2) })
    expect(latestJoins([a, b])).toEqual([a, b])
  })

  test('the same identity in another pool is a separate join', () => {
    const here = join('A', 1, { id: idOf(1) })
    const elsewhere = join('A', 1, { id: idOf(2), poolId: 'other' })
    expect(latestJoins([here, elsewhere])).toHaveLength(2)
  })

  test('equal timestamps are broken by document id so every client picks the same one', () => {
    const lower = join('A', 5, { id: idOf(1) })
    const higher = join('A', 5, { id: idOf(2) })
    expect(latestJoins([lower, higher])).toEqual([higher])
    expect(latestJoins([higher, lower])).toEqual([higher])
  })
})