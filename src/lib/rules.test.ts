import { describe, expect, test } from 'vitest'
import { DUFFS_PER_DASH } from './consensus'
import { selectionProblems } from './rules'
import type { Join, Pool } from './types'

const pool = { earlyPenalty: 0 } as Pool

const join = (ownerId: string, dash: number, n: number, over: Partial<Join> = {}): Join => ({
  id: `join-${n}`,
  ownerId,
  createdAt: 0,
  poolId: 'pool',
  amount: dash * DUFFS_PER_DASH,
  ownerAddress: `yOwner${n}`,
  refundAddress: `yRefund${n}`,
  inputs: [],
  changeAddress: `yChange${n}`,
  ...over
})

describe('selectionProblems', () => {
  test('two distinct members summing to the collateral are fine', () => {
    expect(selectionProblems(pool, [join('A', 500, 1), join('B', 500, 2)])).toEqual([])
  })

  test('the same identity twice is rejected — one share counts per identity', () => {
    const problems = selectionProblems(pool, [join('A', 500, 1), join('A', 500, 2)])
    expect(problems).toContain('Two shares come from the same identity')
  })

  test('distinct identities sharing an owner address are still rejected', () => {
    const problems = selectionProblems(pool, [
      join('A', 500, 1),
      join('B', 500, 2, { ownerAddress: 'yOwner1' })
    ])
    expect(problems).toContain('Two members use the same owner address')
  })
})