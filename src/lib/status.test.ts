import { describe, expect, test } from 'vitest'
import { derivePoolStatus, poolErrorCause, type StatusInput } from './status.js'

type Input = Omit<StatusInput, 'masternodeListHeight'> & { masternodeListHeight?: number | null }

function status (overrides: Partial<Input>): ReturnType<typeof derivePoolStatus> {
  return derivePoolStatus({
    lock: { id: 'lock1', poolId: 'p', ownerId: 'o', joinIds: [], createdAt: 1 },
    allConsented: true,
    allFunded: true,
    regTx: { txid: 'a'.repeat(64), height: 500 },
    masternode: null,
    masternodeListHeight: 500,
    height: 600,
    dissolutionTxid: null,
    ...overrides
  } as StatusInput)
}

describe('derivePoolStatus — a pool that can never complete reads Error', () => {
  test('a broken lock is Error, not a permanently signing pool', () => {
    expect(status({ blocked: true, allConsented: false, allFunded: false })).toBe('ERROR')
  })
  test('a registration that cannot be broadcast is Error', () => {
    expect(status({ blocked: true, regTx: null })).toBe('ERROR')
  })
  test('a pool with no lock is still Open regardless of blockers', () => {
    expect(status({ lock: null, blocked: false })).toBe('NEW')
  })
  test('a mined registration is chain truth, so preflight complaints do not hide it', () => {
    expect(status({ blocked: true, masternode: { proTxHash: 'a'.repeat(64), isValid: true, service: '1.2.3.4:9999' } })).toBe('FORMED')
  })
  test('without blockers an incomplete pool keeps Signing', () => {
    expect(status({ blocked: false, allConsented: false })).toBe('SIGNING')
  })
})

describe('derivePoolStatus — a broadcast dissolution outranks the list', () => {
  const listed = { proTxHash: 'a'.repeat(64), isValid: false, service: '[::]:0' }
  const txid = 'b'.repeat(64)

  test('dissolving while the chainlocked list still holds the entry', () => {
    expect(status({ masternode: listed, dissolutionTxid: txid })).toBe('DISSOLVING')
  })

  test('dissolving even when the entry would otherwise read as error', () => {
    expect(status({ masternode: listed, height: 900, dissolutionTxid: txid })).toBe('DISSOLVING')
  })

  test('dissolving while no entry is left but the list is behind', () => {
    expect(status({ masternode: null, masternodeListHeight: null, dissolutionTxid: txid })).toBe('DISSOLVING')
  })

  test('dissolved once the list has dropped the entry', () => {
    expect(status({ masternode: null, masternodeListHeight: 501, dissolutionTxid: txid })).toBe('DISSOLVED')
  })
})

describe('derivePoolStatus — list-height gate', () => {
  test('signing when the list has never arrived', () => {
    expect(status({ masternodeListHeight: null, masternode: null })).toBe('SIGNING')
  })

  test('signing when the list is behind the registration height', () => {
    expect(status({ masternodeListHeight: 499, masternode: null })).toBe('SIGNING')
  })

  test('dissolved when the list is the same height and the masternode is absent', () => {
    expect(status({ masternodeListHeight: 500, masternode: null })).toBe('DISSOLVED')
  })

  test('dissolved when the list is ahead', () => {
    expect(status({ masternodeListHeight: 501, masternode: null })).toBe('DISSOLVED')
  })

  test('formed when the list covers the height and the entry is valid', () => {
    expect(status({ masternode: { proTxHash: 'a'.repeat(64), isValid: true, service: '1.2.3.4:9999' } })).toBe('FORMED')
  })

  test('error when the entry is invalid', () => {
    expect(status({ masternode: { proTxHash: 'a'.repeat(64), isValid: false, service: '1.2.3.4:9999' } })).toBe('ERROR')
  })

  test('an entry decides the status even when the list reports no height', () => {
    expect(status({ masternodeListHeight: null, masternode: { proTxHash: 'a'.repeat(64), isValid: false, service: '[::]:0' } })).toBe('ERROR')
    expect(status({ masternodeListHeight: null, masternode: { proTxHash: 'a'.repeat(64), isValid: true, service: '1.2.3.4:9999' } })).toBe('FORMED')
  })
})

describe('derivePoolStatus — grace period after registration', () => {
  const unaddressed = { proTxHash: 'a'.repeat(64), isValid: false, service: '[::]:0' }

  test('registered while an address-less node is inside the grace window', () => {
    expect(status({ height: 510, masternode: unaddressed })).toBe('REGISTERED')
    expect(status({ height: 523, masternode: unaddressed })).toBe('REGISTERED')
  })

  test('error once the grace window closes with no address', () => {
    expect(status({ height: 524, masternode: unaddressed })).toBe('ERROR')
  })

  test('error inside the window when an address is set but the node is not valid', () => {
    expect(status({ height: 510, masternode: { ...unaddressed, service: '1.2.3.4:9999' } })).toBe('ERROR')
  })

  test('formed as soon as the node becomes valid, inside the window or not', () => {
    expect(status({ height: 510, masternode: { ...unaddressed, isValid: true } })).toBe('FORMED')
    expect(status({ height: 900, masternode: { ...unaddressed, isValid: true, service: '1.2.3.4:9999' } })).toBe('FORMED')
  })
})

describe('poolErrorCause — why it reads Error', () => {
  const node = (over: Partial<{ proTxHash: string, isValid: boolean, service: string }> = {}) => ({
    proTxHash: 'a'.repeat(64), isValid: true, service: '1.2.3.4:19999', ...over
  })

  test('no cause unless the pool reads Error', () => {
    expect(poolErrorCause({ status: 'FORMED', masternode: node(), lockProblems: [], broadcastProblems: [] })).toBeNull()
    expect(poolErrorCause({
      status: 'REGISTERED', masternode: node({ isValid: false, service: '[::]:0' }), lockProblems: [], broadcastProblems: []
    })).toBeNull()
  })

  test('an error with no list entry blames the documents, not the network', () => {
    expect(poolErrorCause({
      status: 'ERROR', masternode: null, lockProblems: ['Share 1 is 5 DASH short'], broadcastProblems: []
    })).toEqual({ kind: 'blocked', problems: ['Share 1 is 5 DASH short'] })
  })

  test('lock and preflight problems are merged and de-duplicated', () => {
    expect(poolErrorCause({ status: 'ERROR', masternode: null, lockProblems: ['x'], broadcastProblems: ['x', 'y'] }))
      .toEqual({ kind: 'blocked', problems: ['x', 'y'] })
  })

  test('a node registered without an address is not a PoSe ban', () => {
    expect(poolErrorCause({
      status: 'ERROR', masternode: node({ isValid: false, service: '[::]:0' }), lockProblems: [], broadcastProblems: []
    })).toEqual({ kind: 'no-service' })
    expect(poolErrorCause({
      status: 'ERROR', masternode: node({ isValid: false, service: '' }), lockProblems: [], broadcastProblems: []
    })).toEqual({ kind: 'no-service' })
  })

  test('an addressed node the network rejects names the address it advertises', () => {
    expect(poolErrorCause({
      status: 'ERROR', masternode: node({ isValid: false, service: '85.209.243.52:19999' }), lockProblems: [], broadcastProblems: []
    })).toEqual({ kind: 'invalid', service: '85.209.243.52:19999' })
  })
})