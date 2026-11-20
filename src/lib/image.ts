/** Centre-crop an image file to a square and downscale it to `size` px, as a PNG data URL */
export async function squareDataUrl (file: Blob, size = 64): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (context == null) throw new Error('Canvas is unavailable')
    // Nearest-neighbour keeps pixel art crisp when it is downscaled
    context.imageSmoothingEnabled = false
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
    return canvas.toDataURL('image/png')
  } finally {
    bitmap.close()
  }
}