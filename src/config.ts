import { parseDash } from './lib/format'
import type { Duffs } from './lib/types'

const DEFAULT_REGISTRATION_FEE: Duffs = 20_000 // 0.0002 DASH

export const contractId = import.meta.env?.VITE_CONTRACT_ID ?? ''

/**
 * Owner identity and creation nonce of the deployed pool contract. The contract id is derived from
 * these two, so the client can build the contract from schema.json instead of fetching it from DAPI.
 */
export const contractOwner = '9m1QYXVRyUpg99PyVD6DcdffuMhsJfgwLDxTeAg6PxDj'
export const contractNonce = 1n

/** Custom DAPI addresses from Settings, with a scheme added; empty means the SDK's default seeds */
export function dapiEndpoints (): string[] {
  try {
    const raw = localStorage.getItem('dts:settings')
    const endpoints = (JSON.parse(raw ?? '{}') as { dapiEndpoints?: string[] }).dapiEndpoints ?? []
    return endpoints.map(url => url.startsWith('http') ? url : `https://${url}`)
  } catch {
    return []
  }
}

function registrationFee (): Duffs {
  const raw = import.meta.env?.VITE_REGISTRATION_FEE
  if (raw == null || raw.trim() === '') return DEFAULT_REGISTRATION_FEE
  const fee = parseDash(raw)
  if (fee == null || fee <= 0) {
    console.warn(`Invalid VITE_REGISTRATION_FEE "${raw}", using ${DEFAULT_REGISTRATION_FEE} duffs`)
    return DEFAULT_REGISTRATION_FEE
  }
  return fee
}

export const config = {
  /**
   * Fee for the shared registration transaction, written into each new pool document. Pools keep their
   * own value, so every client builds the same transaction whatever its configuration.
   */
  registrationFee: registrationFee()
}
