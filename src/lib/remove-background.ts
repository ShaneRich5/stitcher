import type { ImageSegmentationPipeline, PretrainedConfig, RawImage } from '@huggingface/transformers'
import type { LoadedImage } from './carousel'
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
const ALPHA_FLOOR = 16

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

function drawScaled(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return canvas
}

/** The model's grayscale mask as the alpha channel of an otherwise empty canvas. */
function maskCanvas(mask: RawImage): HTMLCanvasElement {
  const pixels = new ImageData(mask.width, mask.height)
  for (let i = 0; i < mask.width * mask.height; i++) {
    const alpha = mask.data[i * mask.channels]!
    pixels.data[i * 4 + 3] = alpha < ALPHA_FLOOR ? 0 : alpha
  }
  const canvas = document.createElement('canvas')
  canvas.width = mask.width
  canvas.height = mask.height
  canvas.getContext('2d')?.putImageData(pixels, 0, 0)
  return canvas
}

/**
 * Cut the subject out of a registered image and register the result as a new transparent PNG
 * of the same size, so a layer can swap to it without moving. The mask is computed on a
 * scaled-down copy, then stretched over the original pixels, so the cutout keeps full resolution.
 * `onDownload` reports model download progress (0–1) on first use.
 */
export async function removeBackground(
  imageId: string,
  name: string,
  onDownload?: (fraction: number) => void,
): Promise<LoadedImage> {
  const source = getImage(imageId)?.image
  if (!source) throw new Error('That image is no longer loaded')
  const width = source.naturalWidth || source.width
  const height = source.naturalHeight || source.height

  const { RawImage } = await import('@huggingface/transformers')
  const scale = Math.min(1, INFERENCE_MAX / Math.max(width, height))
  const small = drawScaled(source, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
  const mask = await segment(RawImage.fromCanvas(small), onDownload)

  const out = drawScaled(maskCanvas(mask), width, height)
  const ctx = out.getContext('2d')!
  ctx.globalCompositeOperation = 'source-in'
  ctx.drawImage(source, 0, 0, width, height)

  const id = crypto.randomUUID()
  await registerBlob(id, await toBlob(out, 'png'))
  return {
    id,
    name: name.endsWith(' (cutout)') ? name : `${name} (cutout)`,
    naturalWidth: width,
    naturalHeight: height,
  }
}
