// Deterministic fake hashes and signatures for mock data. Not cryptographic.

function fnv1a (input: string, seed: number): number {
  let hash = 0x811c9dc5 ^ seed
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** 32-byte hex digest of a string */
export function mockHash (input: string, bytes = 32): string {
  let out = ''
  for (let i = 0; out.length < bytes * 2; i++) {
    out += fnv1a(input, i * 0x9e3779b1).toString(16).padStart(8, '0')
  }
  return out.slice(0, bytes * 2)
}

/** Long hex blob standing in for a serialized transaction */
export function mockTxHex (input: string, bytes = 380): string {
  return '0300' + '0100' + mockHash(input, bytes)
}

/** Base64 of a 65-byte compact signature with a canonical header (31) */
export function mockSignature (seed: string): string {
  const bytes = new Uint8Array(65)
  bytes[0] = 31
  const hex = mockHash(seed, 64)
  for (let i = 1; i < 65; i++) bytes[i] = parseInt(hex.slice((i - 1) * 2, i * 2), 16)
  // Keep S low so the mock passes the low-S rule
  bytes[33] &= 0x7f
  return btoa(String.fromCharCode(...bytes))
}

/** Deterministic pseudo-random generator for fixtures */
export function seededRandom (seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function randomBase58 (random: () => number, length: number, prefix = ''): string {
  let out = prefix
  while (out.length < length) out += BASE58_ALPHABET[Math.floor(random() * BASE58_ALPHABET.length)]
  return out
}

export function randomHex (random: () => number, bytes: number): string {
  let out = ''
  for (let i = 0; i < bytes; i++) out += Math.floor(random() * 256).toString(16).padStart(2, '0')
  return out
}
