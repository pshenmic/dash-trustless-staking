import { describe, expect, test } from 'vitest'
import {
  anonymousPoolName, latestCreatorMeta, poolDisplayDescription, poolDisplayName, withDisplayMeta
} from './poolName'
import type { Pool, PoolMeta } from './types'

const ID = '8uff2sddkV889RW5xgYYGP7GskCFdh5MN3opC3DLJnwF'
const CREATOR = 'creator'
const pool = (extra: Partial<Pool> = {}): Pool => ({
  id: ID, ownerId: CREATOR, createdAt: 0, operatorPubKey: 'ab'.repeat(48),
  votingAddress: 'yVoting', operatorReward: 500, earlyPeriodBlocks: 0, earlyPenalty: 0, fee: 20000,
  ...extra
})
const meta = (createdAt: number, fields: Partial<PoolMeta> = {}, ownerId = CREATOR): PoolMeta =>
  ({ id: `m-${createdAt}-${ownerId}`, ownerId, createdAt, poolId: ID, ...fields })

describe('anonymousPoolName', () => {
  test('uses the first six characters of the pool id', () => {
    expect(anonymousPoolName(ID)).toBe('Anonymous Pool #8uff2s')
  })
})

describe('latestCreatorMeta', () => {
  test('takes the newest document', () => {
    expect(latestCreatorMeta([meta(1, { name: 'Old' }), meta(2, { name: 'New' })], CREATOR)?.name).toBe('New')
  })
  test('ignores a stranger who published metadata for the pool', () => {
    const own = meta(1, { name: 'Mine' })
    const stranger = meta(2, { name: 'Hijack' }, 'stranger')
    expect(latestCreatorMeta([own, stranger], CREATOR)).toBe(own)
  })
  test('no creator documents is null', () => {
    expect(latestCreatorMeta([meta(1, { name: 'Hijack' }, 'stranger')], CREATOR)).toBeNull()
  })
})

describe('poolDisplayName', () => {
  test('anonymous when neither the document nor the creator named it', () => {
    expect(poolDisplayName(pool())).toBe('Anonymous Pool #8uff2s')
  })
  test('the creator title wins over the document name', () => {
    expect(poolDisplayName(pool({ name: 'On the document' }), meta(1, { name: 'Promo' }))).toBe('Promo')
  })
  test('the document name is used for a generation 1 pool without metadata', () => {
    expect(poolDisplayName(pool({ name: 'Legacy Node #1' }))).toBe('Legacy Node #1')
  })
  test('a blank name counts as absent', () => {
    expect(poolDisplayName(pool({ name: '   ' }))).toBe('Anonymous Pool #8uff2s')
  })
})

describe('poolDisplayDescription', () => {
  test('falls back to the document, then to empty', () => {
    expect(poolDisplayDescription(pool())).toBe('')
    expect(poolDisplayDescription(pool({ description: 'Document' }))).toBe('Document')
    expect(poolDisplayDescription(pool({ description: 'Document' }), meta(1, { description: 'Promo' }))).toBe('Promo')
  })
})

describe('withDisplayMeta', () => {
  test('applies the newest creator metadata and keeps the pool id', () => {
    const displayed = withDisplayMeta(pool(), [meta(1, { name: 'First' }), meta(2, { name: 'Second', description: 'Text' })])
    expect(displayed.id).toBe(ID)
    expect(displayed.name).toBe('Second')
    expect(displayed.description).toBe('Text')
  })
  test('a stranger cannot rename the pool', () => {
    expect(withDisplayMeta(pool(), [meta(5, { name: 'Hijack' }, 'stranger')]).name).toBe('Anonymous Pool #8uff2s')
  })
})