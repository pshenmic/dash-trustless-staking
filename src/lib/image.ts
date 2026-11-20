/** The only avatar sizes the pool avatar accepts — exact dimensions, no cropping or scaling */
export const AVATAR_SIZES = [32, 64] as const
/** Matches the contract's `image.maxItems`; a 64×64 PNG is well under this */
export const AVATAR_MAX_BYTES = 8192

export type AvatarSize = typeof AVATAR_SIZES[number]

/** Why a width/height pair is not an acceptable avatar, or null when it is */
export function avatarSizeProblem (width: number, height: number): string | null {
  if (width !== height) return 'The avatar must be square.'
  if (!(AVATAR_SIZES as readonly number[]).includes(width)) return 'The avatar must be exactly 32×32 or 64×64 pixels.'
  return null
}

export type AvatarResult =
  | { ok: true, dataUrl: string, size: AvatarSize }
  | { ok: false, reason: string }

/**
 * Validate and normalise a picked image: exact 32 or 64 square, re-encoded to PNG so metadata is
 * stripped and the bytes are a canonical image rather than whatever the file happened to contain.
 */
export async function readAvatar (file: Blob): Promise<AvatarResult> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { ok: false, reason: 'That file is not an image we can read.' }
  }

  try {
    const problem = avatarSizeProblem(bitmap.width, bitmap.height)
    if (problem != null) {
      return { ok: false, reason: bitmap.width === bitmap.height ? `${problem} This one is ${bitmap.width}×${bitmap.height}.` : problem }
    }

    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (context == null) return { ok: false, reason: 'Canvas is unavailable in this browser.' }
    context.drawImage(bitmap, 0, 0)

    const dataUrl = canvas.toDataURL('image/png')
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
    if (bytes > AVATAR_MAX_BYTES) return { ok: false, reason: `The image is too large (${bytes} bytes, max ${AVATAR_MAX_BYTES}).` }

    return { ok: true, dataUrl, size: bitmap.width as AvatarSize }
  } finally {
    bitmap.close()
  }
}