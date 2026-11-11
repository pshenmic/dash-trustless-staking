import type { DashPlatformSDK } from 'dash-platform-sdk'
import { toHex } from '../../lib/bytes'
import { HOSTING_CONTRACT_ID, HOSTING_OWNER_ID } from '../../hosting'
import type { HostingOptions, HostingServer, HostingSource, HostingTerms } from '../types'

const PAGE = 100

interface RawDocument {
  properties: Record<string, unknown>
}

function decodeTerms (doc: RawDocument): HostingTerms | null {
  const properties = doc.properties
  const operatorRewardMin = properties.operatorRewardMin
  if (typeof operatorRewardMin !== 'number' || !Number.isInteger(operatorRewardMin)) return null
  return {
    operatorRewardMin,
    description: typeof properties.description === 'string' ? properties.description : '',
    url: typeof properties.url === 'string' ? properties.url : ''
  }
}

function decodeServer (doc: RawDocument): HostingServer | null {
  const properties = doc.properties
  if (properties.status !== 'AVAILABLE') return null
  if (typeof properties.name !== 'string' || typeof properties.region !== 'string') return null
  const rawKey = properties.operatorPubKey
  if (!(rawKey instanceof Uint8Array) && !Array.isArray(rawKey)) return null
  const operatorPubKey = toHex(Uint8Array.from(rawKey as Uint8Array | number[]))
  if (operatorPubKey.length !== 96) return null
  return { name: properties.name, region: properties.region, operatorPubKey }
}

/** Reads pshenmic.dev's hosting contract: the singleton terms and the AVAILABLE servers */
export function createLiveHosting (sdk: DashPlatformSDK): HostingSource {
  return {
    async getOptions (): Promise<HostingOptions> {
      const [termDocs, serverDocs] = await Promise.all([
        sdk.documents.query(HOSTING_CONTRACT_ID, 'terms', [['$ownerId', '==', HOSTING_OWNER_ID]] as never, undefined as never, PAGE) as unknown as RawDocument[],
        sdk.documents.query(HOSTING_CONTRACT_ID, 'server', [['status', '==', 'AVAILABLE']] as never, undefined as never, PAGE) as unknown as RawDocument[]
      ])
      const terms = termDocs.map(decodeTerms).find((value): value is HostingTerms => value != null) ?? null
      const servers = serverDocs
        .map(decodeServer)
        .filter((value): value is HostingServer => value != null)
      return { terms, servers }
    }
  }
}