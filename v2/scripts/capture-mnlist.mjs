import { DashCoreSDK } from 'dash-core-sdk'
import { writeFileSync } from 'node:fs'

TESTNET_DAPI = process.env.DAPI_URL ?? 'seed-1.testnet.networks.dash.org:1443'

const sdk = new DashCoreSDK({ network: 'testnet', dapiUrl: TESTNET_DAPI })

console.log(`Subscribing to masternode list via ${TESTNET_DAPI} ...`)

const call = await sdk.subscribeToMasternodeList()

for await (const response of call.responses) {
  const bytes = response.masternodeListDiff

  if (!bytes || bytes.byteLength === 0) {
    console.warn('Received empty diff, waiting for next ...')

    continue
  }

  const fixture = { hex: Buffer.from(bytes).toString('hex') }
  const path = 'src/lib/fixtures/mnlist-diff.cbor.json'

  writeFileSync(path, JSON.stringify(fixture, null, 2) + '\n')

  console.log(`Captured ${bytes.byteLength} bytes → ${path}`)
  console.log(`Additional diffs still arriving (${Buffer.from(bytes.slice(0, 6)).toString('hex')} …)`)

  break // one full diff is enough for the fixture
}

console.log('Done.')
process.exit(0)
