import type { LoadedImage } from './carousel'
import { registerBlob } from './image-registry'

export function imageFiles(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))
}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  const id = crypto.randomUUID()
  const { image } = await registerBlob(id, file).catch(() => {
    throw new Error(`Could not open ${file.name || 'image'}`)
  })
  return {
    id,
    name: file.name || 'Pasted image',
    naturalWidth: image.naturalWidth || image.width,
    naturalHeight: image.naturalHeight || image.height,
  }
}
