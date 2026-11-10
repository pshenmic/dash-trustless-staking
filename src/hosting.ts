import type { HostingServer, HostingTerms } from './data/types'
import type { OperatorProvider } from './operators'

/** pshenmic.dev hosting contract on testnet (from ../pshenmic-masternode-hosting) */
export const HOSTING_CONTRACT_ID = import.meta.env?.VITE_HOSTING_CONTRACT_ID ?? '48mAzzn5UV3vLLm1M5iXs9i2qrcvpBh1kv3imdTaRxhg'

/**
 * The voting address every pool hosted by pshenmic.dev must use. The operator holds this key and votes
 * on governance for the masternode; it is not derived from the hosting contract.
 */
export const HOSTING_VOTING_ADDRESS = 'ygVtwBQx7MiHS84FtX8CFTqgFBf8z25B2b'

export const HOSTING_PROVIDER_ID = 'pshenmic.dev'

const FALLBACK_DESCRIPTION = 'Hosted masternode operation. pshenmic.dev runs the server and sets its address after registration.'
const FALLBACK_URL = 'https://pshenmic.dev'

/**
 * Builds the operator entry the create form uses. The contract's terms fix the fee; each AVAILABLE
 * server contributes one operator key. Without terms there is nothing a creator can agree to, so no
 * keys are offered.
 */
export function buildHostingProvider (terms: HostingTerms | null, servers: HostingServer[]): OperatorProvider {
  const keys = terms == null
    ? []
    : servers
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(server => ({
          pubKey: server.operatorPubKey.toLowerCase(),
          city: `${server.name} · ${server.region}`,
          operatorReward: terms.operatorRewardMin,
          votingAddress: HOSTING_VOTING_ADDRESS
        }))

  return {
    id: HOSTING_PROVIDER_ID,
    name: 'pshenmic.dev',
    url: terms?.url !== undefined && terms.url !== '' ? terms.url : FALLBACK_URL,
    description: terms?.description !== undefined && terms.description !== '' ? terms.description : FALLBACK_DESCRIPTION,
    keys
  }
}