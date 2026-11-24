import { describe, expect, test, vi } from 'vitest'
import { PrivateKeyWASM, type IdentityPublicKeyWASM, type IdentityWASM } from 'pshenmic-dpp'
import { findIdentityForKeys, parsePrivateKey, type IdentityDirectory } from './identity'

const authKey = PrivateKeyWASM.fromHex('01'.repeat(32), 'testnet')
const authHash = authKey.getPublicKeyHash()

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

const goodKeys = (): IdentityPublicKeyWASM[] => [fakeKey({ keyId: 0, hash: authHash })]

const find = async (keys = goodKeys(), overrides: Partial<IdentityDirectory> = {}, contractId = 'contract-id') =>
  await findIdentityForKeys(authKey, { contractId, directory: directory(keys, overrides) })

describe('findIdentityForKeys', () => {
  test('returns the identity and the authentication key id', async () => {
    await expect(find()).resolves.toEqual({ identityId: 'identity-id', authKeyId: 0 })
  })

  test('rejects a non-authentication key', async () => {
    // An encryption key is no longer asked for, and it must not be accepted as the login key either
    const keys = [fakeKey({ keyId: 0, hash: authHash, purpose: 1 })]
    await expect(find(keys)).rejects.toThrow(/not an authentication key/)
  })

  test('rejects a MEDIUM security key', async () => {
    await expect(find([fakeKey({ keyId: 0, hash: authHash, security: 3 })])).rejects.toThrow(/security level is too low/)
  })

  test('rejects a read-only authentication key', async () => {
    await expect(find([fakeKey({ keyId: 0, hash: authHash, readOnly: true })])).rejects.toThrow(/read-only/)
  })

  test('rejects a disabled authentication key', async () => {
    await expect(find([fakeKey({ keyId: 0, hash: authHash, disabled: 1n })])).rejects.toThrow(/disabled/)
  })

  test('rejects an expired authentication key', async () => {
    await expect(find([fakeKey({ keyId: 0, hash: authHash, expired: true })])).rejects.toThrow(/expired/)
  })

  test("accepts bounds to this contract and rejects another contract's", async () => {
    await expect(find([fakeKey({ keyId: 0, hash: authHash, bounds: { contract: 'contract-id', documentType: null } })]))
      .resolves.toMatchObject({ authKeyId: 0 })

    await expect(find([fakeKey({ keyId: 0, hash: authHash, bounds: { contract: 'other-contract', documentType: null } })]))
      .rejects.toThrow(/restricted/)
  })

  test('rejects a key bound to one document type', async () => {
    const keys = [fakeKey({ keyId: 0, hash: authHash, bounds: { contract: 'contract-id', documentType: 'pool' } })]
    await expect(find(keys)).rejects.toThrow(/restricted/)
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
    await expect(findIdentityForKeys(authKey, {
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