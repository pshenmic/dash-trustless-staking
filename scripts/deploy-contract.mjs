// Deploys a schema as a new data contract on testnet, owned by the identity in .env.local.
// Usage: node scripts/deploy-contract.mjs [schema.json path, default ../schema.json]
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { identityId, sdk, signAndBroadcast } from './env.mjs'

const schemaUrl = new URL(process.argv[2] ?? '../schema.json', import.meta.url)
const schema = JSON.parse(readFileSync(fileURLToPath(schemaUrl), 'utf8'))

const balanceBefore = await sdk.identities.getIdentityBalance(identityId)
const identityNonce = await sdk.identities.getIdentityNonce(identityId) + 1n

const dataContract = sdk.dataContracts.create(identityId, identityNonce, schema, true)
const contractId = dataContract.id.base58()
console.log('schema:        ', fileURLToPath(schemaUrl))
console.log('document types:', Object.keys(schema).join(', '))
console.log('join indices:  ', JSON.stringify(schema.join?.indices?.map(i => ({ name: i.name, unique: i.unique ?? false }))))
console.log('contract id:   ', contractId)
console.log('identity nonce:', identityNonce.toString())

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
