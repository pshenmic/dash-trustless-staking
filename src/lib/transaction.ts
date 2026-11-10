import { ByteReader } from './bytes'
import type { Duffs } from './types'

export interface TxOutput {
  value: Duffs
  script: Uint8Array
}

/**
 * Reads the outputs of a serialized Dash transaction. Works for special transactions too: their type
 * shares the first 4 bytes with the version, and their extra payload comes after the lock time.
 */
export function parseOutputs (raw: Uint8Array): TxOutput[] {
  const reader = new ByteReader(raw)
  reader.read(4) // version (uint16) + type (uint16)
  const inputs = reader.compactSize()
  for (let i = 0; i < inputs; i++) {
    reader.read(36) // prevout
    reader.read(reader.compactSize()) // scriptSig
    reader.read(4) // sequence
  }
  const outputs = reader.compactSize()
  return Array.from({ length: outputs }, () => ({ value: reader.uint64(), script: reader.read(reader.compactSize()) }))
}
