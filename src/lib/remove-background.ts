import type { ImageSegmentationPipeline, PretrainedConfig, RawImage } from '@huggingface/transformers'
import type { Box, LoadedImage } from './carousel'
import { toBlob } from './export-carousel'
import { getImage, registerBlob } from './image-registry'

/**
 * Subject cutouts with BRIA's RMBG-1.4, run in the browser through Transformers.js. The runtime
 * is imported on first use and the model is fetched from the Hugging Face Hub then (the browser
 * caches it), so neither weighs on the app's own load. RMBG-1.4 is licensed for non-commercial
 * use only.
 */
const MODEL_ID = 'briaai/RMBG-1.4'
/** The model sees a 1024 × 1024 input, so bigger photos are scaled down before inference. */
const INFERENCE_MAX = 1024
/** Mask values below this (of 255) count as background, which clears faint specks. */
export const ALPHA_FLOOR = 16
/** Kept around a trimmed subject, in source pixels, on top of the mask's own stretch. */
const TRIM_PAD = 4

type Backend = { device: 'webgpu' | 'wasm'; dtype: 'fp16' | 'q8' }
/** fp16 on the GPU is fast and gives the cleanest edges, but it's an 88 MB download. */
const WEBGPU: Backend = { device: 'webgpu', dtype: 'fp16' }
/** The 44 MB 8-bit model on the CPU, for browsers without WebGPU or fp16 shaders. */
const WASM: Backend = { device: 'wasm', dtype: 'q8' }

let current: { backend: Backend; pipe: Promise<ImageSegmentationPipeline> } | null = null
let webgpuFailed = false

async function createPipeline(backend: Backend, onDownload?: (fraction: number) => void) {
  const { pipeline } = await import('@huggingface/transformers')
  return pipeline('image-segmentation', MODEL_ID, {
    ...backend,
    // RMBG-1.4's config names an architecture Transformers.js doesn't map; the model is an IS-Net.
    config: { model_type: 'isnet' } as PretrainedConfig,
    progress_callback: (p) => {
      if (p.status === 'progress_total') onDownload?.(p.progress / 100)
    },
  })
}

function getPipeline(backend: Backend, onDownload?: (fraction: number) => void) {
  if (current?.backend !== backend) {
    const pipe = createPipeline(backend, onDownload)
    current = { backend, pipe }
    // Forget a failed load so the next attempt starts over.
    pipe.catch(() => {
      if (current?.pipe === pipe) current = null
    })
  }
  return current.pipe
}

/** One channel, 0 (background) to 255 (subject), over the scaled-down copy the models see. */
export type Mask = { data: Uint8Array | Uint8ClampedArray; width: number; height: number }

async function segment(input: RawImage, onDownload?: (fraction: number) => void): Promise<RawImage> {
  const backend = !webgpuFailed && 'gpu' in navigator ? WEBGPU : WASM
  try {
    const pipe = await getPipeline(backend, onDownload)
    const [result] = await pipe(input)
    if (!result) throw new Error('The model returned no mask')
    return result.mask
  } catch (e) {
    if (backend !== WEBGPU) throw e
    // No fp16 shaders, or the GPU session failed: use the CPU model from now on.
    webgpuFailed = true
    return segment(input, onDownload)
  }
}

/** RMBG's subject mask for an image the size of `input`. */
export async function subjectMask(input: RawImage, onDownload?: (fraction: number) => void): Promise<Mask> {
  const raw = await segment(input, onDownload)
  const data = new Uint8Array(raw.width * raw.height)
  for (let i = 0; i < data.length; i++) data[i] = raw.data[i * raw.channels]!
  return { data, width: raw.width, height: raw.height }
}

/** The source drawn at most INFERENCE_MAX on its long edge, as the models see it. */
export function inferenceCopy(source: HTMLImageElement): HTMLCanvasElement {
  const width = source.naturalWidth || source.width
  const height = source.naturalHeight || source.height
  const scale = Math.min(1, INFERENCE_MAX / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** A mask as the alpha channel of an otherwise empty canvas. */
function maskCanvas(mask: Mask): HTMLCanvasElement {
  const pixels = new ImageData(mask.width, mask.height)
  for (let i = 0; i < mask.width * mask.height; i++) {
    const alpha = mask.data[i]!
    pixels.data[i * 4 + 3] = alpha < ALPHA_FLOOR ? 0 : alpha
  }
  const canvas = document.createElement('canvas')
  canvas.width = mask.width
  canvas.height = mask.height
  canvas.getContext('2d')?.putImageData(pixels, 0, 0)
  return canvas
}

/** The smallest box around the pixels the mask keeps, in mask pixels; null when it keeps none. */
function maskBounds(mask: Mask): Box | null {
  let x0 = mask.width
  let y0 = mask.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[y * mask.width + x]! < ALPHA_FLOOR) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      y1 = y
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}

/**
 * Where the subject sits in the source image, padded and clamped to it. The mask is stretched
 * over the source with high-quality smoothing, whose kernel can spread its edge a couple of mask
 * pixels further, so the pad covers three.
 */
function trimBox(mask: Mask, width: number, height: number): Box {
  const bounds = maskBounds(mask)
  if (!bounds) return { x: 0, y: 0, width, height }
  const sx = width / mask.width
  const sy = height / mask.height
  const pad = Math.ceil(3 * Math.max(sx, sy)) + TRIM_PAD
  const x0 = Math.max(0, Math.floor(bounds.x * sx) - pad)
  const y0 = Math.max(0, Math.floor(bounds.y * sy) - pad)
  const x1 = Math.min(width, Math.ceil((bounds.x + bounds.width) * sx) + pad)
  const y1 = Math.min(height, Math.ceil((bounds.y + bounds.height) * sy) + pad)
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export type Cutout = LoadedImage & {
  /** The part of the source image the cutout covers, in source pixels: all of it unless trimmed. */
  crop: Box
}

/**
 * Cut the subject out of a registered image and register the result as a new transparent PNG.
 * By default it's the same size as the source, so a layer can swap to it without moving; with
 * `trim` it's cropped to the subject, and `crop` says where that sits in the source. The mask is
 * computed on a scaled-down copy, then stretched over the original pixels, so the cutout keeps
 * full resolution. `onDownload` reports model download progress (0–1) on first use.
 */
export async function removeBackground(
  imageId: string,
  name: string,
  onDownload?: (fraction: number) => void,
  { trim = false }: { trim?: boolean } = {},
): Promise<Cutout> {
  const source = getImage(imageId)?.image
  if (!source) throw new Error('That image is no longer loaded')
  const { RawImage } = await import('@huggingface/transformers')
  const mask = await subjectMask(RawImage.fromCanvas(inferenceCopy(source)), onDownload)
  return cutoutFromMask(imageId, name, mask, { trim })
}

/** Register the part of a registered image that `mask` keeps (any size) as a cutout, as above. */
export async function cutoutFromMask(
  imageId: string,
  name: string,
  mask: Mask,
  { trim = false }: { trim?: boolean } = {},
): Promise<Cutout> {
  const source = getImage(imageId)?.image
  if (!source) throw new Error('That image is no longer loaded')
  const width = source.naturalWidth || source.width
  const height = source.naturalHeight || source.height
  const crop = trim ? trimBox(mask, width, height) : { x: 0, y: 0, width, height }

  // Draw the mask and the photo over the full source size, shifted so only the crop lands.
  const out = document.createElement('canvas')
  out.width = crop.width
  out.height = crop.height
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(maskCanvas(mask), -crop.x, -crop.y, width, height)
  ctx.globalCompositeOperation = 'source-in'
  ctx.drawImage(source, -crop.x, -crop.y, width, height)

  const id = crypto.randomUUID()
  await registerBlob(id, await toBlob(out, 'png'))
  return {
    id,
    name: name.endsWith(' (cutout)') ? name : `${name} (cutout)`,
    naturalWidth: crop.width,
    naturalHeight: crop.height,
    crop,
  }
}
