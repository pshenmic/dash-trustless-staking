import { describe, expect, test } from 'vitest'
import { poolEvents, poolMetaEvents, voteEvents } from './activity'
import type { Join, PoolMeta, Vote } from '../../lib/types'
import type { PoolState } from '../../data/queries'

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
describe('poolEvents — join history', () => {
  const join = (ownerId: string, createdAt: number): Join => ({
    id: `join-${createdAt}`, ownerId, createdAt, poolId: 'pool', amount: 100 * 100_000_000,
    ownerAddress: 'yOwner', refundAddress: 'yRefund', inputs: [], changeAddress: 'yChange'
  })
  const state = (joins: Join[]): PoolState => ({
    pool: { id: 'pool', ownerId: 'creator', createdAt: 0, name: 'Pool', description: '', archived: false },
    joins, allJoins: joins, lock: null, members: [], status: 'NEW', regTx: null
  }) as unknown as PoolState

  test('a top-up keeps the earlier join in the feed and reads as an update', () => {
    const texts = poolEvents(state([join('A', 1), join('A', 2)])).map(e => e.text)
    expect(texts[1]).toMatch(/^took a .* share$/)
    expect(texts[2]).toMatch(/^updated their share to /)
  })

  test('two identities each get a plain join line', () => {
    const texts = poolEvents(state([join('A', 1), join('B', 2)])).map(e => e.text)
    expect(texts[1]).toMatch(/^took a .* share$/)
    expect(texts[2]).toMatch(/^took a .* share$/)
  })
})

describe('poolMetaEvents', () => {
  const meta = (createdAt: number, fields: Partial<PoolMeta>, ownerId = 'creator'): PoolMeta =>
    ({ id: `m-${createdAt}-${ownerId}`, ownerId, createdAt, poolId: 'pool', ...fields })
  const owner = { ownerId: 'creator', name: undefined, description: undefined }

  test('a stranger cannot put a line in the pool history', () => {
    expect(poolMetaEvents([meta(1000, { name: 'Hijack' }, 'stranger')], owner)).toEqual([])
  })
  test('one revision with two changes is two lines', () => {
    const events = poolMetaEvents([meta(1000, { name: 'Hyperwave', description: 'A node in Berlin' })], owner)
    expect(events).toEqual([
      { at: 1000, who: 'creator', text: 'renamed the pool to “Hyperwave”', tone: 'brand' },
      { at: 1000, who: 'creator', text: 'added a pool description', tone: 'brand' }
    ])
  })
  test('a save that repeats the values adds no line', () => {
    const revision = { name: 'Hyperwave', description: 'A node in Berlin' }
    expect(poolMetaEvents([meta(1000, revision), meta(2000, revision)], owner)).toHaveLength(2)
  })
  test('clearing every field returns the pool to anonymous and says so, change by change', () => {
    const events = poolMetaEvents([meta(1000, { name: 'Hyperwave', description: 'Text' }), meta(2000, {})], owner)
    expect(events.filter(e => e.at === 2000)).toEqual([
      { at: 2000, who: 'creator', text: 'removed the pool title', tone: 'brand' },
      { at: 2000, who: 'creator', text: 'removed the pool description', tone: 'brand' }
    ])
  })
  test('a generation 1 pool keeps its own name, so a description-only revision is not a rename', () => {
    const legacy = { ownerId: 'creator', name: 'Legacy Node #1', description: undefined }
    const events = poolMetaEvents([meta(1000, { description: 'Promo text' })], legacy)
    expect(events[0].text).toBe('added a pool description')
  })
})
