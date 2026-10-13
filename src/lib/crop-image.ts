import type { Box, LoadedImage } from './carousel'
import { toBlob } from './export-carousel'
import { getImage, registerBlob } from './image-registry'

/**
 * Register `crop` (in the image's pixels) of a registered image as a new image. JPEGs stay JPEG,
 * so a cropped photo isn't much bigger than its source; anything else becomes a PNG.
 */
export async function cropImage(imageId: string, name: string, crop: Box): Promise<LoadedImage> {
  const record = getImage(imageId)
  if (!record) throw new Error('That image is no longer loaded')
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(crop.width))
  out.height = Math.max(1, Math.round(crop.height))
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(record.image, crop.x, crop.y, crop.width, crop.height, 0, 0, out.width, out.height)

  const id = crypto.randomUUID()
  await registerBlob(id, await toBlob(out, record.blob.type === 'image/jpeg' ? 'jpeg' : 'png'))
  return { id, name, naturalWidth: out.width, naturalHeight: out.height }
}
