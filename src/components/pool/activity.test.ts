import { describe, expect, test } from 'vitest'
import { voteEvents } from './activity'
import type { Join, Vote } from '../../lib/types'

const PROP = '5884221907e247d044102fbc3e20544b999ecbfc0fef3b4f8f4607da1f6f5abe'
const member = (ownerId: string): Join => ({
  id: `join-${ownerId}`, ownerId, createdAt: 0, poolId: 'pool', amount: 100_000_000,
  ownerAddress: 'yOwner', refundAddress: 'yRefund', inputs: [], changeAddress: 'yChange'
})
const vote = (ownerId: string, outcome: 1 | 2 | 3, createdAt: number): Vote =>
  ({ id: `v-${ownerId}-${createdAt}`, ownerId, createdAt, poolId: 'pool', proposalHash: PROP, outcome })

describe('voteEvents', () => {
  const members = [member('A'), member('B')]
  test('non-member votes are excluded', () => {
    expect(voteEvents([vote('A', 1, 1000), vote('D', 2, 2000)], members)).toHaveLength(1)
  })
  test('every member choice including a superseded one gets a line', () => {
    const events = voteEvents([vote('A', 1, 1000), vote('A', 2, 2000)], members)
    expect(events).toHaveLength(2)
    expect(events[0].text).toContain('YES')
    expect(events[1].text).toContain('NO')
  })
  test('event shape uses a short proposal hash', () => {
    const [e] = voteEvents([vote('A', 2, 2000)], members)
    expect(e).toEqual({ at: 2000, who: 'A', text: `recorded NO on proposal ${PROP.slice(0, 8)}…`, tone: 'mint' })
  })
  test('empty votes is empty', () => {
    expect(voteEvents([], members)).toEqual([])
  })
})