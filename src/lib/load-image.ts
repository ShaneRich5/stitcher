import type { LoadedImage } from './carousel'
import { registerBlob } from './image-registry'

/** What the file inputs offer. Windows doesn't always map `.heic` to `image/*`, so it's named too. */
export const IMAGE_ACCEPT = 'image/*,.heic,.heif'

const IMAGE_EXTENSION = /\.(jpe?g|jfif|png|gif|webp|avif|heic|heif|bmp|svg|ico|tiff?)$/i
const HEIC_TYPE = /^image\/hei[cf]/
const HEIC_EXTENSION = /\.hei[cf]$/i

/**
 * Every file in a drop, paste or pick. Nothing is filtered out here: `loadImageFiles` says why
 * each file it can't open was skipped, so no file disappears without a message.
 */
export function listFiles(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? [])
}

/** An image by its type or, since Windows and some drag sources leave the type empty, its name. */
export function isImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  if (file.type.startsWith('image/')) return true
  return (!file.type || file.type === 'application/octet-stream') && IMAGE_EXTENSION.test(file.name)
}

export function isHeicFile(file: Pick<File, 'name' | 'type'>): boolean {
  return HEIC_TYPE.test(file.type) || HEIC_EXTENSION.test(file.name)
}

export type SkipReason = 'not-image' | 'heic' | 'decode'

class SkippedFile extends Error {
  reason: SkipReason
  constructor(reason: SkipReason, name: string) {
    super(`Could not open ${name}`)
    this.reason = reason
  }
}

/**
 * Only Safari decodes HEIC itself. Elsewhere it's converted to JPEG, with the converter (about
 * 1.3 MB) loaded the first time it's needed.
 */
async function heicToJpeg(file: File): Promise<File> {
  const { default: heic2any } = await import('heic2any')
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
  const jpeg = Array.isArray(out) ? out[0]! : out
  // Kept a File with the original's date, which the date stamp falls back on.
  return new File([jpeg], file.name.replace(/\.hei[cf]$/i, '.jpg'), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  })
}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  const name = file.name || 'Pasted image'
  if (!isImageFile(file)) throw new SkippedFile('not-image', name)
  const id = crypto.randomUUID()
  let record
  try {
    record = await registerBlob(id, file)
  } catch {
    if (!isHeicFile(file)) throw new SkippedFile('decode', name)
    try {
      record = await registerBlob(id, await heicToJpeg(file))
    } catch (e) {
      console.error(e)
      throw new SkippedFile('heic', name)
    }
  }
  const { image } = record
  return {
    id,
    name,
    naturalWidth: image.naturalWidth || image.width,
    naturalHeight: image.naturalHeight || image.height,
  }
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many.replace('#', String(n))
}

/** Why some files were skipped, in one line, from the names of each kind. */
export function skippedMessage(skipped: { name: string; reason: SkipReason }[]): string | null {
  const names = (reason: SkipReason) => skipped.filter((s) => s.reason === reason).map((s) => s.name)
  const notImages = names('not-image')
  const heic = names('heic')
  const broken = names('decode')
  const parts: string[] = []
  if (notImages.length) {
    parts.push(plural(notImages.length, `${notImages[0]} isn't an image`, "# files aren't images"))
  }
  if (heic.length) {
    parts.push(
      `${plural(heic.length, heic[0]!, '# HEIC photos')} couldn't be converted here. Export as JPEG, or open Stitcher in Safari`,
    )
  }
  if (broken.length) parts.push(plural(broken.length, `Could not open ${broken[0]}`, 'Could not open # files'))
  return parts.length ? parts.join('. ') : null
}

/** Load files in order, keeping the ones that open, with a message about any that didn't. */
export async function loadImageFiles(
  files: File[],
): Promise<{ images: LoadedImage[]; message: string | null }> {
  const results = await Promise.allSettled(files.map(loadImageFile))
  const images: LoadedImage[] = []
  const skipped: { name: string; reason: SkipReason }[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') images.push(r.value)
    else {
      const reason = r.reason instanceof SkippedFile ? r.reason.reason : 'decode'
      skipped.push({ name: files[i]!.name || 'Pasted image', reason })
    }
  })
  return { images, message: skippedMessage(skipped) }
}
