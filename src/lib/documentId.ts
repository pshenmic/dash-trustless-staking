import { base58 } from '@scure/base'

/**
 * Byte-wise lexicographic order of base58 document ids. Platform ids are random, so base58 string order
 * can disagree with the decoded bytes; anything that orders documents by id must use this.
 */
export function compareDocumentIds (a: string, b: string): number {
  const x = base58.decode(a), y = base58.decode(b)
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1
}