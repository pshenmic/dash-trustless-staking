/*
 * Third-party operators a creator can choose instead of running their own node. The operator holds the
 * BLS secret key: they run the node and set its address with a ProUpServTx after registration, so pools
 * using them register without a service address.
 *
 * Each key can back only one masternode. The create form checks every key against the masternode list
 * and the pool operatorPubKey index and only offers free ones.
 */

export interface OperatorKey {
  /** BLS public key (basic scheme, hex) */
  pubKey: string
  /** Where the server for this key runs: an ISO 3166-1 alpha-2 code; absent means worldwide */
  country?: string
  /** Shown next to the country; not stored in the pool */
  city?: string
  /** Operator reward the operator charges for this key, in basis points (500 = 5%). Pools using the key must use it. */
  operatorReward: number
  /** Voting address (P2PKH) the operator votes with for this key's masternode. Pools using the key must use it. */
  votingAddress: string
}

export interface OperatorProvider {
  id: string
  name: string
  url: string
  description: string
  /** Keys the operator has ready for new masternodes, one server each */
  keys: OperatorKey[]
  /** The keys are made-up preview data: never offered against a real network */
  placeholder?: boolean
}

export const OPERATOR_PROVIDERS: OperatorProvider[] = [
  {
    id: 'pshenmic.dev',
    name: 'pshenmic.dev',
    url: 'https://pshenmic.dev',
    description: 'Hosted masternode operation. pshenmic.dev runs the server and sets its address after registration.',
    // TODO: placeholder keys, locations, fees and voting addresses for the mock preview. Replace with
    // pshenmic.dev's real ones (per network) and remove `placeholder` to offer them on testnet.
    placeholder: true,
    keys: [
      { pubKey: '79a4b8c83f4c602745135fecc26dae628982c868a00d767f86f5e75eb8c61de6c7f93e37fcc35ad85a911bf8e3087be0', country: 'DE', city: 'Frankfurt', operatorReward: 500, votingAddress: 'yBkAxbQSmP6izYMJXfpxgzuqJ1yykVoEKR' },
      { pubKey: 'e744f289727e2f62666b1aa969e03abda2294be5eef9beff874a62b9e318ef73741cc0e54323775df09e705f64b4b969', country: 'NL', city: 'Amsterdam', operatorReward: 500, votingAddress: 'ya6Zh82qEi8wzq9N5m4qAgWUHsMXerGYum' },
      { pubKey: '4f8e5233e9f25d5d5b47a5cd8012717008ce166e4cf54ded37aba0eb9195ca67ba7cac03a665e63bd4fd48a9be4148b5', country: 'FI', city: 'Helsinki', operatorReward: 400, votingAddress: 'ySSCRxkD4tetFXP1jHzAnS3PdxbD3GJNch' },
      { pubKey: '88510cc14e3b51ba81e16e522cf4354451af81d9019f488ecd0960444c8a98e25404e25c314d38095c1be1d07fa1717d', country: 'US', city: 'New York', operatorReward: 600, votingAddress: 'yrKwTVvnCziUX59h5693mbn49G4Z6pYAS7' },
      { pubKey: '1abd36fe194b0cb45dd3e4cd6a9ab3fde599223ba0cd39a7c441288d9934fc33066cf5f8452bad9a48eb37259636a15f', country: 'SG', city: 'Singapore', operatorReward: 500, votingAddress: 'yMSWyK3RVBggcCtRSHRHUoXTZPuwRjx2an' }
    ]
  }
]

/** Short operator ID shown to users: the first 8 hex characters of the operator public key */
export function operatorId (operatorPubKey: string): string {
  return operatorPubKey.slice(0, 8).toLowerCase()
}

/** The third-party operator that owns a key, if any */
export function findProvider (operatorPubKey: string): OperatorProvider | null {
  const key = operatorPubKey.toLowerCase()
  return OPERATOR_PROVIDERS.find(p => p.keys.some(k => k.pubKey.toLowerCase() === key)) ?? null
}

/** The listed key entry (with its location), if a third-party operator owns it */
export function findOperatorKey (operatorPubKey: string): OperatorKey | null {
  const key = operatorPubKey.toLowerCase()
  for (const provider of OPERATOR_PROVIDERS) {
    const found = provider.keys.find(k => k.pubKey.toLowerCase() === key)
    if (found != null) return found
  }
  return null
}
