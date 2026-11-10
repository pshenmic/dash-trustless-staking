import type { IdentityPublicKeyWASM, IdentityWASM, PrivateKeyWASM } from 'pshenmic-dpp'
import { contractId as configuredContractId, dapiEndpoints } from '../config'

const NETWORK_ERROR = 'Could not reach Dash Platform. Check your connection and try again.'
const NOT_FOUND_ERROR = 'No Dash Platform identity uses this key.'
const DEFAULT_TIMEOUT_MS = 10_000

export interface FoundIdentity {
  identityId: string
  authKeyId: number
  encryptionKeyId: number
}

export interface IdentityDirectory {
  byKeyHash: (hash: string) => Promise<IdentityWASM>
  byNonUniqueKeyHash: (hash: string) => Promise<IdentityWASM>
  publicKeys: (identity: IdentityWASM) => Promise<IdentityPublicKeyWASM[]>
}

export interface FindIdentityOptions {
  contractId?: string
  dapiUrls?: string[]
  directory?: IdentityDirectory
  timeoutMs?: number
}

interface KeyFacts {
  keyId: number
  hash: string
  keyType: string
  purpose: number
  securityLevel: number
  readOnly: boolean
  disabled: boolean
  expired: boolean
  boundsContract: string | null
  boundsDocumentType: string | null
}

function errorMessage (e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function isNotFound (e: unknown): boolean {
  return /not found/i.test(errorMessage(e))
}

function withDeadline<T> (promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Dash Platform lookup timed out')), timeoutMs)
    promise.then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) }
    )
  })
}

async function createDirectory (dapiUrls: string[]): Promise<IdentityDirectory> {
  const { DashPlatformSDK } = await import('dash-platform-sdk')
  const sdk = new DashPlatformSDK(dapiUrls.length > 0 ? { network: 'testnet', dapiUrl: dapiUrls } as never : { network: 'testnet' })
  return {
    byKeyHash: async hash => await sdk.identities.getIdentityByPublicKeyHash(hash),
    byNonUniqueKeyHash: async hash => await sdk.identities.getIdentityByNonUniquePublicKeyHash(hash),
    publicKeys: async identity => {
      const keys = identity.getPublicKeys()
      return keys.length > 0 ? keys : await sdk.identities.getIdentityPublicKeys(identity.id.base58())
    }
  }
}

function facts (key: IdentityPublicKeyWASM, now: number): KeyFacts {
  let expired = false
  try {
    expired = key.isExpiredAt(now)
  } catch {
    // A key without an expiry is not expired
  }
  const bounds = key.contractBounds
  let boundsContract: string | null = null
  let boundsDocumentType: string | null = null
  if (bounds != null) {
    try {
      boundsContract = bounds.identifier.base58()
      boundsDocumentType = bounds.documentTypeName
    } catch {
      boundsContract = ''
    }
  }
  return {
    keyId: key.keyId,
    hash: key.getPublicKeyHash(),
    keyType: key.keyType,
    purpose: key.purposeNumber,
    securityLevel: key.securityLevelNumber,
    readOnly: key.readOnly,
    disabled: key.disabledAt != null,
    expired,
    boundsContract,
    boundsDocumentType
  }
}

function purposeName (purpose: number): string {
  switch (purpose) {
    case 1: return 'encryption'
    case 2: return 'decryption'
    case 3: return 'transfer'
    case 4: return 'system'
    case 5: return 'voting'
    case 6: return 'owner'
    default: return 'unknown'
  }
}

function validateAuthenticationKey (key: KeyFacts, appContractId: string): void {
  if (key.keyType !== 'ECDSA_SECP256K1') {
    throw new Error('The authentication key is not an ECDSA secp256k1 key.')
  }
  if (key.purpose !== 0) {
    throw new Error(`This key is an ${purposeName(key.purpose)} key, not an authentication key.`)
  }
  if (key.securityLevel > 2) {
    throw new Error("This key's security level is too low for this contract's documents.")
  }
  if (key.readOnly) throw new Error('This authentication key is read-only.')
  if (key.disabled) throw new Error('This authentication key is disabled.')
  if (key.expired) throw new Error('This authentication key is expired.')
  if (key.boundsContract != null && (key.boundsContract !== appContractId || key.boundsDocumentType != null)) {
    throw new Error('This authentication key is restricted to another contract or document type.')
  }
}

function validateEncryptionKey (key: KeyFacts, authenticationKeyId: number): void {
  if (key.keyId === authenticationKeyId) throw new Error('Use a separate encryption key.')
  if (key.keyType !== 'ECDSA_SECP256K1' || (key.purpose !== 1 && key.purpose !== 2)) {
    throw new Error('The encryption key is not an ENCRYPTION or DECRYPTION key of this identity.')
  }
  if (key.disabled) throw new Error('The encryption key is disabled.')
  if (key.expired) throw new Error('The encryption key is expired.')
}

/** Parses a WIF or a 64-character hex private key; throws a user-facing message otherwise. */
export async function parsePrivateKey (text: string): Promise<PrivateKeyWASM> {
  const { PrivateKeyWASM } = await import('pshenmic-dpp')
  const value = text.trim()
  if (/^[0-9a-f]{64}$/i.test(value)) return PrivateKeyWASM.fromHex(value, 'testnet')
  try {
    return PrivateKeyWASM.fromWIF(value)
  } catch {
    throw new Error('Not a valid WIF or 64-character hex private key')
  }
}

/**
 * Finds the one identity that owns both keys. The authentication key determines the identity; the
 * encryption key must be another key of that same identity. Validation happens before the session is
 * stored, so a key that cannot sign or decrypt is refused at login rather than at the first write.
 */
export async function findIdentityForKeys (
  authenticationKey: PrivateKeyWASM,
  encryptionKey: PrivateKeyWASM,
  options: FindIdentityOptions = {}
): Promise<FoundIdentity> {
  const appContractId = options.contractId ?? configuredContractId
  if (appContractId === '') throw new Error('VITE_CONTRACT_ID is not configured.')
  const directory = options.directory ?? await createDirectory(options.dapiUrls ?? dapiEndpoints())
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const authHash = authenticationKey.getPublicKeyHash()

  let identity: IdentityWASM
  try {
    identity = await withDeadline(directory.byKeyHash(authHash), timeoutMs)
  } catch (e) {
    if (!isNotFound(e)) throw new Error(NETWORK_ERROR)
    try {
      identity = await withDeadline(directory.byNonUniqueKeyHash(authHash), timeoutMs)
    } catch (e2) {
      if (isNotFound(e2)) throw new Error(NOT_FOUND_ERROR)
      throw new Error(NETWORK_ERROR)
    }
  }

  const keys = await withDeadline(directory.publicKeys(identity), timeoutMs)
  const now = Date.now()
  const authentication = keys.find(key => key.getPublicKeyHash() === authHash)
  if (authentication == null) throw new Error(NOT_FOUND_ERROR)
  const authFacts = facts(authentication, now)
  validateAuthenticationKey(authFacts, appContractId)

  const encHash = encryptionKey.getPublicKeyHash()
  const encryption = keys.find(key => key.getPublicKeyHash() === encHash)
  if (encryption == null) {
    const hasEncryptionKey = keys.some(key => {
      const f = facts(key, now)
      return f.keyType === 'ECDSA_SECP256K1' && (f.purpose === 1 || f.purpose === 2)
    })
    throw new Error(hasEncryptionKey
      ? 'The encryption key belongs to another identity or is not an encryption key of this identity.'
      : 'This identity has no encryption key. Add one in your wallet first.')
  }
  const encFacts = facts(encryption, now)
  validateEncryptionKey(encFacts, authFacts.keyId)

  return {
    identityId: identity.id.base58(),
    authKeyId: authFacts.keyId,
    encryptionKeyId: encFacts.keyId
  }
}