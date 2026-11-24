import { expect, test } from 'vitest'
import { GENERATIONS, lockSupportsEntries, schemaHasDocument } from './contracts'

const generation = (slug: string) => GENERATIONS.find(g => g.slug === slug)!

test('generation 1 has no poolMeta — metadata queries must not reach its contract', () => {
  expect(schemaHasDocument(generation('v1').schema, 'poolMeta')).toBe(false)
})

test('generation 2 declares poolMeta', () => {
  expect(schemaHasDocument(generation('v2').schema, 'poolMeta')).toBe(true)
})

test('the voting key field is named differently per generation — the decoder accepts both', () => {
  const properties = (slug: string) => (generation(slug).schema.pool as { properties: Record<string, unknown> }).properties
  expect('votingKeyId' in properties('v1')).toBe(true)
  expect('votingAddress' in properties('v1')).toBe(false)
  expect('votingAddress' in properties('v2')).toBe(true)
  expect('votingKeyId' in properties('v2')).toBe(false)
})

test('every generation still declares the types the shared queries read', () => {
  for (const ref of GENERATIONS) {
    for (const type of ['pool', 'join', 'lock', 'vote', 'feedback']) {
      expect(schemaHasDocument(ref.schema, type), `${ref.slug}.${type}`).toBe(true)
    }
  }
})

test('the lock packs its shares as strings — the protocol rejects arrays of objects', () => {
  const properties = (generation('v2').schema.lock as { properties: Record<string, { type: string, items: { type: string } }> }).properties
  expect(properties.entries.type).toBe('array')
  expect(properties.entries.items.type).toBe('string')
})

test('only generation 2 can store packed shares — generation 1 must never receive entries', () => {
  expect(lockSupportsEntries(generation('v1'))).toBe(false)
  expect(lockSupportsEntries(generation('v2'))).toBe(true)
})