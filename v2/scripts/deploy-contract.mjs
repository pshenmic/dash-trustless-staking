// Deploys ../schema.json as a new data contract on testnet, owned by the identity in .env.local.
// Usage: node scripts/deploy-contract.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { identityId, sdk, signAndBroadcast } from './env.mjs'

const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../../schema.json', import.meta.url)), 'utf8'))

const balanceBefore = await sdk.identities.getIdentityBalance(identityId)
const identityNonce = await sdk.identities.getIdentityNonce(identityId) + 1n

const dataContract = sdk.dataContracts.create(identityId, identityNonce, schema, true)
const contractId = dataContract.id.base58()
console.log('document types:', Object.keys(schema).join(', '))
console.log('contract id:   ', contractId)

const stateTransition = sdk.dataContracts.createStateTransition(dataContract, 'create', identityNonce)
try {
  await signAndBroadcast(stateTransition)
} catch (e) {
  console.error('REJECTED:', e?.message ?? e)
  process.exit(1)
}

const balanceAfter = await sdk.identities.getIdentityBalance(identityId)
console.log('deployed. cost:', (balanceBefore - balanceAfter).toString(), 'credits =', Number(balanceBefore - balanceAfter) / 1e11, 'DASH')
console.log('balance left:  ', balanceAfter.toString(), 'credits')
process.exit(0)
