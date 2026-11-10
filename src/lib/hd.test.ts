import { describe, expect, test } from 'vitest'
import { Network } from 'dash-core-sdk'
import { coinType, deriveCoreKey, deriveCoreKeys, isValidSeedPhrase } from './hd'

// Standard BIP39 test vector phrase (no passphrase)
const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('coinType', () => {
  test('uses BIP44 coin types for Dash', () => {
    expect(coinType('testnet')).toBe(1)
    expect(coinType('mainnet')).toBe(5)
  })
})

describe('isValidSeedPhrase', () => {
  test('accepts a valid phrase and rejects a broken checksum', () => {
    expect(isValidSeedPhrase(PHRASE)).toBe(true)
    expect(isValidSeedPhrase(PHRASE.replace(/about$/, 'abandon'))).toBe(false)
    expect(isValidSeedPhrase('')).toBe(false)
  })

  test('tolerates casing and extra whitespace', () => {
    expect(isValidSeedPhrase(`  ${PHRASE.replace(/ /g, '\n  ')}  `)).toBe(true)
  })
})

describe('deriveCoreKey', () => {
  test('derives the known testnet key at m/44\'/1\'/0\'/0/0', () => {
    const key = deriveCoreKey(PHRASE, 0)

    // Cross-checked against @dashevo/dashcore-lib 0.26.1 (address and WIF both match)
    expect(key.path).toBe("m/44'/1'/0'/0/0")
    expect(key.address).toBe('yRd4FhXfVGHXpsuZXPNkMrfD9GVj46pnjt')
    expect(key.wif).toBe('cV6NTLu255SZ5iCNkVHezNGDH5qv6CanJpgBPqYgJU13NNKJhRs1')
  })

  test('derives mainnet keys on the coin-5 path', () => {
    const key = deriveCoreKey(PHRASE, 0, { network: 'mainnet' })

    expect(key.path).toBe("m/44'/5'/0'/0/0")
    expect(key.address.startsWith('X')).toBe(true)
    expect(key.wif.startsWith('X')).toBe(true)
    expect(key.address).not.toBe(deriveCoreKey(PHRASE, 0).address)
  })

  test('passphrase changes the derived key', () => {
    expect(deriveCoreKey(PHRASE, 0, { passphrase: 'TREZOR' }).address).not.toBe(deriveCoreKey(PHRASE, 0).address)
  })

  test('honours account and change', () => {
    const key = deriveCoreKey(PHRASE, 0, { account: 2, change: 1 })

    expect(key.path).toBe("m/44'/1'/2'/1/0")
  })

  test('rejects an invalid phrase and a negative index', () => {
    expect(() => deriveCoreKey('not a phrase', 0)).toThrow(/Not a valid BIP39/)
    expect(() => deriveCoreKey(PHRASE, -1)).toThrow(/Invalid address index/)
  })

  test('the WIF reproduces the address', () => {
    const key = deriveCoreKey(PHRASE, 7)
    const fromWif = require('dash-core-sdk').PrivateKey.fromWIF(key.wif)

    expect(fromWif.getPublicKey().getAddress(Network.Testnet)).toBe(key.address)
  })
})

describe('deriveCoreKeys', () => {
  test('derives a sequence with unique addresses', () => {
    const keys = deriveCoreKeys(PHRASE, 300)

    expect(keys).toHaveLength(300)
    expect(new Set(keys.map(k => k.address)).size).toBe(300)
    expect(keys[299].path).toBe("m/44'/1'/0'/0/299")
  })

  test('rejects a non-positive count', () => {
    expect(() => deriveCoreKeys(PHRASE, 0)).toThrow(/Invalid address count/)
  })
})