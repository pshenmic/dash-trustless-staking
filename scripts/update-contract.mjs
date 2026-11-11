// Updates the existing pool data contract in place, owned by the identity in .env.local.
// Usage: node scripts/update-contract.mjs [--broadcast] [contractId]
//
// The schema comes from ../schema.json. The contract keeps its id and owner; only the version
// increases. Without --broadcast it fetches and builds the update transition, prints the result and
// exits before signing or sending anything.
//
// The signer must be an AUTHENTICATION key with CRITICAL security; DAPI rejects HIGH for a contract
// update. The owner identity has keyId 1 (AUTHENTICATION/CRITICAL); .env.local must use that WIF.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { identityId, sdk, signAndBroadcast, signingKey } from './env.mjs'

const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../schema.json', import.meta.url)), 'utf8'))
const env = Object.fromEntries(
  readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8')
    .split('\n')
    .filter(line => line.includes('=') && !line.trim().startsWith('#'))
    .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])
)

const broadcast = process.argv.includes('--broadcast')
const contractId = process.argv.slice(2).find(arg => !arg.startsWith('-')) ?? env.VITE_CONTRACT_ID
if (contractId == null || contractId === '') throw new Error('Pass the contract id or set VITE_CONTRACT_ID in .env')

const current = await sdk.dataContracts.getDataContractByIdentifier(contractId)
const owner = current.ownerId.base58()
if (owner !== identityId) {
  throw new Error(`.env.local identity ${identityId} is not the contract owner ${owner}`)
}

const signer = await signingKey()
const purposes = { 0: 'AUTHENTICATION', 1: 'ENCRYPTION', 2: 'DECRYPTION', 3: 'TRANSFER', 4: 'SYSTEM', 5: 'VOTING', 6: 'OWNER' }
const levels = { 1: 'CRITICAL', 2: 'HIGH', 3: 'MEDIUM' }
const signerLabel = `keyId ${signer.keyId} (${purposes[signer.purposeNumber] ?? signer.purposeNumber}/${levels[signer.securityLevelNumber] ?? signer.securityLevelNumber})`

// A data contract update uses the identity-contract nonce for that contract, not the global identity
// nonce. getIdentityContractNonce returns the nonce at the tip; the transition uses the next one.
const identityNonce = await sdk.identities.getIdentityContractNonce(identityId, contractId) + 1n
const next = sdk.dataContracts.create(current.ownerId, identityNonce, schema, true)
next.id = current.id
next.ownerId = current.ownerId
next.version = current.version + 1
next.description = current.description
next.keywords = current.keywords
const config = current.getConfig()
if (config != null) next.setConfig(config)

const currentTypes = Object.keys(current.getSchemas())
const nextTypes = Object.keys(next.getSchemas())
console.log('contract id:   ', contractId)
console.log('owner:         ', owner)
console.log('current version:', current.version)
console.log('next version:   ', next.version)
console.log('contract nonce: ', identityNonce.toString())
console.log('signing key:   ', signerLabel)
console.log('current types: ', currentTypes.join(', '))
console.log('next types:    ', nextTypes.join(', '))
console.log('added types:   ', nextTypes.filter(type => !currentTypes.includes(type)).join(', ') || '(none)')

const stateTransition = sdk.dataContracts.createStateTransition(next, 'update', identityNonce)
console.log('transition:    ', stateTransition.constructor?.name ?? 'StateTransition', stateTransition.bytes().length, 'bytes')

if (!broadcast) {
  console.log('dry run — pass --broadcast to sign and send')
  process.exit(0)
}

if (signer.purposeNumber !== 0 || signer.securityLevelNumber !== 1) {
  throw new Error(`Contract updates require an AUTHENTICATION/CRITICAL key; .env.local matches ${signerLabel}. Use the identity's CRITICAL authentication key.`)
}

try {
  await signAndBroadcast(stateTransition)
} catch (e) {
  console.error('REJECTED:', e?.message ?? e)
  process.exit(1)
}

const updated = await sdk.dataContracts.getDataContractByIdentifier(contractId)
console.log('updated version:', updated.version)
console.log('updated types:  ', Object.keys(updated.getSchemas()).join(', '))
process.exit(0)