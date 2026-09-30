/**
 * Runtime-only lookup from a layer's `imageId` to its decoded image and blob. Layers themselves
 * stay DOM-free (`imageId`, `naturalWidth`, `naturalHeight`), so `CarouselDoc` can be persisted
 * as plain JSON while this registry holds the parts that can't be serialized: the
 * `HTMLImageElement`, its object URL, and the source `Blob` (needed to autosave the image itself).
 */
export type ImageRecord = { url: string; image: HTMLImageElement; blob: Blob }

const registry = new Map<string, ImageRecord>()

export function putImage(id: string, record: ImageRecord): void {
  registry.set(id, record)
}

export function getImage(id: string): ImageRecord | undefined {
  return registry.get(id)
}

export function hasImage(id: string): boolean {
  return registry.has(id)
}

/** Decode a blob into a registered image, reusing an existing entry if one is already loaded. */
export function registerBlob(id: string, blob: Blob): Promise<ImageRecord> {
  const existing = registry.get(id)
  if (existing) return Promise.resolve(existing)
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      const record = { url, image, blob }
      registry.set(id, record)
      resolve(record)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not decode a saved image'))
    }
    image.src = url
  })
}
