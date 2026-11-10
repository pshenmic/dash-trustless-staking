import { describe, expect, test, vi } from 'vitest'
import { PrivateKeyWASM, type IdentityPublicKeyWASM, type IdentityWASM } from 'pshenmic-dpp'
import { findIdentityForKeys, parsePrivateKey, type IdentityDirectory } from './identity'

const authKey = PrivateKeyWASM.fromHex('01'.repeat(32), 'testnet')
const encryptionKey = PrivateKeyWASM.fromHex('02'.repeat(32), 'testnet')
const otherKey = PrivateKeyWASM.fromHex('03'.repeat(32), 'testnet')
const authHash = authKey.getPublicKeyHash()
const encryptionHash = encryptionKey.getPublicKeyHash()
const otherHash = otherKey.getPublicKeyHash()

interface KeyOptions {
  keyId?: number
  hash: string
  keyType?: string
  purpose?: number
  security?: number
  readOnly?: boolean
  disabled?: bigint
  expired?: boolean
  bounds?: { contract: string, documentType: string | null }
}

function fakeKey (options: KeyOptions): IdentityPublicKeyWASM {
  return {
    keyId: options.keyId ?? 0,
    getPublicKeyHash: () => options.hash,
    keyType: options.keyType ?? 'ECDSA_SECP256K1',
    purposeNumber: options.purpose ?? 0,
    securityLevelNumber: options.security ?? 2,
    readOnly: options.readOnly ?? false,
    disabledAt: options.disabled,
    isExpiredAt: () => options.expired ?? false,
    contractBounds: options.bounds == null
      ? undefined
      : {
          identifier: { base58: () => options.bounds!.contract },
          documentTypeName: options.bounds!.documentType
        }
  } as unknown as IdentityPublicKeyWASM
}

function fakeIdentity (keys: IdentityPublicKeyWASM[]): IdentityWASM {
  return {
    id: { base58: () => 'identity-id' },
    getPublicKeys: () => keys
  } as unknown as IdentityWASM
}

function directory (keys: IdentityPublicKeyWASM[], overrides: Partial<IdentityDirectory> = {}): IdentityDirectory {
  const identity = fakeIdentity(keys)
  return {
    byKeyHash: async () => identity,
    byNonUniqueKeyHash: async () => identity,
    publicKeys: async () => keys,
    ...overrides
  }
}

const goodKeys = (): IdentityPublicKeyWASM[] => [
  fakeKey({ keyId: 0, hash: authHash }),
  fakeKey({ keyId: 2, hash: encryptionHash, purpose: 1 })
]

const find = async (keys = goodKeys(), overrides: Partial<IdentityDirectory> = {}, contractId = 'contract-id') =>
  await findIdentityForKeys(authKey, encryptionKey, { contractId, directory: directory(keys, overrides) })

describe('findIdentityForKeys', () => {
  test('returns the identity and both key ids', async () => {
    await expect(find()).resolves.toEqual({ identityId: 'identity-id', authKeyId: 0, encryptionKeyId: 2 })
  })

  test('accepts a DECRYPTION key for encryption', async () => {
    const keys = [fakeKey({ keyId: 0, hash: authHash }), fakeKey({ keyId: 4, hash: encryptionHash, purpose: 2 })]
    await expect(find(keys)).resolves.toMatchObject({ encryptionKeyId: 4 })
  })

  test('rejects a non-authentication key', async () => {
    const keys = [fakeKey({ keyId: 0, hash: authHash, purpose: 1 }), fakeKey({ keyId: 2, hash: encryptionHash, purpose: 1 })]
    await expect(find(keys)).rejects.toThrow(/not an authentication key/)
  })

  test('rejects a MEDIUM security key', async () => {
    const keys = [fakeKey({ keyId: 0, hash: authHash, security: 3 }), fakeKey({ keyId: 2, hash: encryptionHash, purpose: 1 })]
    await expect(find(keys)).rejects.toThrow(/security level is too low/)
  })

  test('rejects a read-only authentication key', async () => {
    const keys = [fakeKey({ keyId: 0, hash: authHash, readOnly: true }), fakeKey({ keyId: 2, hash: encryptionHash, purpose: 1 })]
    await expect(find(keys)).rejects.toThrow(/read-only/)
  })

  test('rejects a disabled authentication key', async () => {
    const keys = [fakeKey({ keyId: 0, hash: authHash, disabled: 1n }), fakeKey({ keyId: 2, hash: encryptionHash, purpose: 1 })]
    await expect(find(keys)).rejects.toThrow(/disabled/)
  })

  test('rejects an expired authentication key', async () => {
    const keys = [fakeKey({ keyId: 0, hash: authHash, expired: true }), fakeKey({ keyId: 2, hash: encryptionHash, purpose: 1 })]
    await expect(find(keys)).rejects.toThrow(/expired/)
  })

  test("accepts bounds to this contract and rejects another contract's", async () => {
    const mine = [
      fakeKey({ keyId: 0, hash: authHash, bounds: { contract: 'contract-id', documentType: null } }),
      fakeKey({ keyId: 2, hash: encryptionHash, purpose: 1 })
    ]
    await expect(find(mine)).resolves.toMatchObject({ authKeyId: 0 })

    const other = [
      fakeKey({ keyId: 0, hash: authHash, bounds: { contract: 'other-contract', documentType: null } }),
      fakeKey({ keyId: 2, hash: encryptionHash, purpose: 1 })
    ]
    await expect(find(other)).rejects.toThrow(/restricted/)
  })

  test('rejects a key bound to one document type', async () => {
    const keys = [
      fakeKey({ keyId: 0, hash: authHash, bounds: { contract: 'contract-id', documentType: 'pool' } }),
      fakeKey({ keyId: 2, hash: encryptionHash, purpose: 1 })
    ]
    await expect(find(keys)).rejects.toThrow(/restricted/)
  })

  test('rejects an encryption key from another identity', async () => {
    const keys = [fakeKey({ keyId: 0, hash: authHash }), fakeKey({ keyId: 2, hash: otherHash, purpose: 1 })]
    await expect(find(keys)).rejects.toThrow(/another identity/)
  })

  test('rejects an identity with no encryption key', async () => {
    const keys = [fakeKey({ keyId: 0, hash: authHash })]
    await expect(find(keys)).rejects.toThrow(/has no encryption key/)
  })

  test('rejects the authentication key reused as encryption', async () => {
    const keys = [fakeKey({ keyId: 0, hash: authHash }), fakeKey({ keyId: 2, hash: encryptionHash, purpose: 1 })]
    await expect(findIdentityForKeys(authKey, authKey, {
      contractId: 'contract-id',
      directory: directory(keys)
    })).rejects.toThrow(/separate encryption key/)
  })

  test('rejects a key that is not an encryption key', async () => {
    const keys = [fakeKey({ keyId: 0, hash: authHash }), fakeKey({ keyId: 3, hash: encryptionHash, purpose: 0 })]
    await expect(find(keys)).rejects.toThrow(/not an ENCRYPTION/)
  })

  test('rejects a disabled encryption key', async () => {
    const keys = [fakeKey({ keyId: 0, hash: authHash }), fakeKey({ keyId: 2, hash: encryptionHash, purpose: 1, disabled: 1n })]
    await expect(find(keys)).rejects.toThrow(/encryption key is disabled/)
  })

  test('falls back to the non-unique lookup only on not-found', async () => {
    const byKeyHash = vi.fn(async () => { throw new Error(`Identity with public key hash ${authHash} not found`) })
    const byNonUniqueKeyHash = vi.fn(async () => fakeIdentity(goodKeys()))
    await expect(find(goodKeys(), { byKeyHash, byNonUniqueKeyHash })).resolves.toMatchObject({ identityId: 'identity-id' })
    expect(byNonUniqueKeyHash).toHaveBeenCalledOnce()
  })

  test('reports not found when both lookups miss', async () => {
    const byKeyHash = vi.fn(async () => { throw new Error(`Identity with public key hash ${authHash} not found`) })
    const byNonUniqueKeyHash = vi.fn(async () => { throw new Error('not found') })
    await expect(find(goodKeys(), { byKeyHash, byNonUniqueKeyHash })).rejects.toThrow(/No Dash Platform identity uses this key/)
  })

  test('does not fall back on a network error', async () => {
    const byKeyHash = vi.fn(async () => { throw new Error('socket closed') })
    const byNonUniqueKeyHash = vi.fn(async () => fakeIdentity(goodKeys()))
    await expect(find(goodKeys(), { byKeyHash, byNonUniqueKeyHash })).rejects.toThrow(/Could not reach Dash Platform/)
    expect(byNonUniqueKeyHash).not.toHaveBeenCalled()
  })

  test('turns a slow lookup into a network error', async () => {
    const byKeyHash = vi.fn(() => new Promise<never>(() => {}))
    await expect(findIdentityForKeys(authKey, encryptionKey, {
      contractId: 'contract-id',
      directory: directory(goodKeys(), { byKeyHash }),
      timeoutMs: 10
    })).rejects.toThrow(/Could not reach Dash Platform/)
  })
})

describe('parsePrivateKey', () => {
  test('parses hex and WIF', async () => {
    expect((await parsePrivateKey('01'.repeat(32))).hex()).toBe('01'.repeat(32))
    const wif = authKey.WIF()
    expect((await parsePrivateKey(wif)).hex()).toBe(authKey.hex())
  })

  test('rejects a malformed key', async () => {
    await expect(parsePrivateKey('not-a-key')).rejects.toThrow(/Not a valid WIF/)
  })
})