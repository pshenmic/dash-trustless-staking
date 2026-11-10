export function toHex (bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export function fromHex (hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function concatBytes (...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Bitcoin-style compact size (varint) */
export function compactSize (n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.from([n])
  if (n <= 0xffff) return Uint8Array.from([0xfd, n & 0xff, n >> 8])
  return Uint8Array.from([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff])
}

/** Sequential reader over serialized Dash/Bitcoin data */
export class ByteReader {
  private offset = 0
  constructor (private readonly bytes: Uint8Array) {}

  get done (): boolean { return this.offset >= this.bytes.length }

  read (length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) throw new Error('Unexpected end of data')
    const out = this.bytes.slice(this.offset, this.offset + length)
    this.offset += length
    return out
  }

  uint32 (): number {
    const b = this.read(4)
    return (b[0] | (b[1] << 8) | (b[2] << 16)) + b[3] * 0x1000000
  }

  /** 64-bit little-endian amount; duffs fit safely in a JS number */
  uint64 (): number {
    const low = this.uint32()
    const high = this.uint32()
    return high * 0x100000000 + low
  }

  compactSize (): number {
    const first = this.read(1)[0]
    if (first < 0xfd) return first
    if (first === 0xfd) { const b = this.read(2); return b[0] | (b[1] << 8) }
    if (first === 0xfe) return this.uint32()
    return this.uint64()
  }
}
