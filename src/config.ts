import { parseDash } from './lib/format'
import type { Duffs } from './lib/types'

const DEFAULT_REGISTRATION_FEE: Duffs = 20_000 // 0.0002 DASH

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
