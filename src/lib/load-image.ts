import type { LoadedImage } from './carousel'

export function imageFiles(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))
}

export function loadImageFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve({ name: file.name || 'Pasted image', url, image })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Could not open ${file.name || 'image'}`))
    }
    image.src = url
  })
}
