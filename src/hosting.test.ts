import { describe, expect, test } from 'vitest'
import { HOSTING_CONTRACT_ID, HOSTING_VOTING_ADDRESS, buildHostingProvider } from './hosting'

const terms = {
  operatorRewardMin: 500,
  description: 'Hosted masternode operation',
  url: 'https://pshenmic.dev/hosting'
}

const fsn = { name: 'fsn-1', region: 'eu-central', operatorPubKey: 'ab'.repeat(48) }
const ams = { name: 'ams-2', region: 'eu-west', operatorPubKey: 'cd'.repeat(48) }

describe('buildHostingProvider', () => {
  test('maps the terms and available servers into operator keys', () => {
    const provider = buildHostingProvider(terms, [fsn, ams])

    expect(provider.id).toBe('pshenmic.dev')
    expect(provider.name).toBe('pshenmic.dev')
    expect(provider.url).toBe(terms.url)
    expect(provider.description).toBe(terms.description)
    expect(provider.keys).toHaveLength(2)
    expect(provider.keys[0]).toEqual({
      pubKey: ams.operatorPubKey,
      city: 'ams-2 · eu-west',
      operatorReward: 500,
      votingAddress: HOSTING_VOTING_ADDRESS
    })
    expect(provider.keys[1]?.city).toBe('fsn-1 · eu-central')
  })

  test('sorts servers by name', () => {
    const provider = buildHostingProvider(terms, [fsn, ams])
    expect(provider.keys.map(key => key.city)).toEqual(['ams-2 · eu-west', 'fsn-1 · eu-central'])
  })

  test('offers nothing when the terms are missing', () => {
    const provider = buildHostingProvider(null, [fsn])
    expect(provider.keys).toEqual([])
    expect(provider.description).not.toBe('')
  })

  test('offers nothing when no servers are available', () => {
    expect(buildHostingProvider(terms, []).keys).toEqual([])
  })

  test('uses the testnet hosting contract and pshenmic.dev voting address', () => {
    expect(HOSTING_CONTRACT_ID).toBe('48mAzzn5UV3vLLm1M5iXs9i2qrcvpBh1kv3imdTaRxhg')
    expect(HOSTING_VOTING_ADDRESS).toBe('ygVtwBQx7MiHS84FtX8CFTqgFBf8z25B2b')
  })
})