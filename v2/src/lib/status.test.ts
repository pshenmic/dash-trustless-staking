import { describe, expect, test } from 'vitest'
import { derivePoolStatus, type StatusInput } from './status.js'

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
    ...overrides
  } as StatusInput)
}

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