// Read-only: shows the test identity's balance and keys.
import { identityId, privateKey, sdk } from './env.mjs'

const [balance, keys] = await Promise.all([
  sdk.identities.getIdentityBalance(identityId),
  sdk.identities.getIdentityPublicKeys(identityId)
])
console.log('identity', identityId)
console.log('balance ', balance.toString(), 'credits')
const hash = privateKey.getPublicKeyHash()
for (const k of keys) {
  console.log(`key ${k.keyId}: purpose=${k.purpose} securityLevel=${k.securityLevel} type=${k.keyType} disabled=${k.disabledAt != null}${k.getPublicKeyHash() === hash ? '  <- matches the private key' : ''}`)
}
process.exit(0)
