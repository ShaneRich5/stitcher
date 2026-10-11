import type { SamModel, SamProcessor, Tensor } from '@huggingface/transformers'
import { getImage } from './image-registry'
import { ALPHA_FLOOR, inferenceCopy, subjectMask, type Mask } from './remove-background'

/**
 * Tap to choose which subject to cut out, with SlimSAM (a pruned Segment Anything) through
 * Transformers.js, loaded on first use like `remove-background.ts`. Its image encoder runs once
 * per photo; each tap only runs the small prompt decoder, so the preview keeps up.
 *
 * SAM's masks are coarse, so they don't cut the edges themselves: RMBG's mask of the same photo
 * does, and SAM picks which parts of it to keep (RMBG alpha × a smoothed SAM mask). Where
 * RMBG found nothing, as with an object it didn't treat as prominent, SAM's mask is used alone.
 */
const MODEL_ID = 'Xenova/slimsam-77-uniform'
/** SAM's confidence is smoothed over this fraction of the copy's long side (twice) before the cut. */
const SMOOTH = 0.006
/**
 * Smoothed SAM confidence from which RMBG's mask starts to be kept, and from which it's all kept.
 * Measured on two players touching: SAM rated the other one under 0.08 nearly everywhere, and the
 * tapped one's least certain limb above 0.18.
 */
const KEEP_FROM = 0.1
const KEEP_TO = 0.2
/** Below this share of SAM's pick that RMBG also calls subject, RMBG missed it: use SAM alone. */
const MIN_AGREEMENT = 0.25
/** A larger mask is preferred over SAM's top-scored one if its score is within this much. */
const SCORE_SLACK = 0.1

type Backend = { device: 'webgpu' | 'wasm'; dtype: 'fp16' | 'q8' }
/** 21 MB at half precision on the GPU. */
const WEBGPU: Backend = { device: 'webgpu', dtype: 'fp16' }
/** 14 MB, 8-bit, on the CPU. */
const WASM: Backend = { device: 'wasm', dtype: 'q8' }

type Sam = { model: SamModel; processor: SamProcessor }
let loaded: { backend: Backend; sam: Promise<Sam> } | null = null
let webgpuFailed = false

async function loadSam(backend: Backend, onDownload?: (fraction: number) => void): Promise<Sam> {
  const { SamModel, SamProcessor } = await import('@huggingface/transformers')
  const [model, processor] = await Promise.all([
    SamModel.from_pretrained(MODEL_ID, {
      ...backend,
      progress_callback: (p) => {
        if (p.status === 'progress_total') onDownload?.(p.progress / 100)
      },
    }),
    SamProcessor.from_pretrained(MODEL_ID),
  ])
  // `from_pretrained` is typed by the base classes; these are the SAM ones.
  return { model: model as SamModel, processor: processor as SamProcessor }
}

function getSam(backend: Backend, onDownload?: (fraction: number) => void) {
  if (loaded?.backend !== backend) {
    const sam = loadSam(backend, onDownload)
    loaded = { backend, sam }
    sam.catch(() => {
      if (loaded?.sam === sam) loaded = null
    })
  }
  return loaded.sam
}

/** One photo, read by both models: SAM's embeddings for the taps, RMBG's mask for the edges. */
type Session = {
  sam: Sam
  /** The source image's size; taps arrive in its pixels. */
  width: number
  height: number
  /** The processor's sizes for the copy, which `post_process_masks` needs back. */
  originalSizes: [number, number][]
  reshapedSizes: [number, number][]
  embeddings: { image_embeddings: Tensor; image_positional_embeddings: Tensor }
  background: Mask
}

let session: { imageId: string; ready: Promise<Session> } | null = null

export type PickerStatus =
  | { step: 'download'; model: 'picker' | 'remover'; fraction: number }
  | { step: 'reading' }

async function openSession(imageId: string, onStatus?: (s: PickerStatus) => void): Promise<Session> {
  const source = getImage(imageId)?.image
  if (!source) throw new Error('That image is no longer loaded')
  const { RawImage } = await import('@huggingface/transformers')
  const copy = RawImage.fromCanvas(inferenceCopy(source))

  const encode = async (): Promise<Omit<Session, 'background' | 'width' | 'height'>> => {
    const backend = !webgpuFailed && 'gpu' in navigator ? WEBGPU : WASM
    try {
      const sam = await getSam(backend, (fraction) => onStatus?.({ step: 'download', model: 'picker', fraction }))
      onStatus?.({ step: 'reading' })
      const inputs = await sam.processor(copy)
      const embeddings = await sam.model.get_image_embeddings(inputs)
      return { sam, originalSizes: inputs.original_sizes, reshapedSizes: inputs.reshaped_input_sizes, embeddings }
    } catch (e) {
      if (backend !== WEBGPU) throw e
      // No fp16 shaders, or the GPU session failed: use the CPU model from now on.
      webgpuFailed = true
      return encode()
    }
  }

  const encoded = await encode()
  const background = await subjectMask(copy, (fraction) =>
    onStatus?.({ step: 'download', model: 'remover', fraction }),
  )
  return {
    ...encoded,
    width: source.naturalWidth || source.width,
    height: source.naturalHeight || source.height,
    background,
  }
}

/**
 * Read a photo with both models, ahead of the taps. Only one photo is kept at a time; opening
 * another replaces it. `onStatus` reports downloads (first use) and the encoder's run.
 */
export function openSubjectPicker(imageId: string, onStatus?: (s: PickerStatus) => void): Promise<void> {
  if (session?.imageId !== imageId) {
    const ready = openSession(imageId, onStatus)
    session = { imageId, ready }
    ready.catch(() => {
      if (session?.ready === ready) session = null
    })
  }
  return session.ready.then(() => undefined)
}

/** A tap in the source image's pixels: `keep` adds what's under it, otherwise it's taken away. */
export type SubjectPoint = { x: number; y: number; keep: boolean }

export type SubjectChoice = {
  /** What to keep, over the models' copy of the photo; `cutoutFromMask` turns it into a cutout. */
  mask: Mask
  /** The photo's size, dimmed outside the choice and tinted inside, for the stage to show. */
  overlay: HTMLCanvasElement
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

/** Box blur in place, `r` pixels each way, edges clamped. */
function boxBlur(values: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h)
  const pass = (src: Float32Array, dst: Float32Array, lines: number, n: number, at: (line: number, i: number) => number) => {
    for (let line = 0; line < lines; line++) {
      let sum = 0
      for (let k = -r; k <= r; k++) sum += src[at(line, Math.min(n - 1, Math.max(0, k)))]!
      for (let i = 0; i < n; i++) {
        dst[at(line, i)] = sum / (2 * r + 1)
        sum += src[at(line, Math.min(n - 1, i + r + 1))]! - src[at(line, Math.max(0, i - r))]!
      }
    }
  }
  pass(values, tmp, h, w, (y, x) => y * w + x)
  pass(tmp, values, w, h, (x, y) => y * w + x)
}

function smoothstep(lo: number, hi: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)))
  return t * t * (3 - 2 * t)
}

/**
 * RMBG's mask, trimmed to the part SAM picked; or SAM's own mask where RMBG found nothing there.
 * SAM's confidence is blotchy (thin limbs and faces hover near even odds, in blocks of its coarse
 * grid) and leaves a faint haze over everything else RMBG found. Smoothed, a low cut keeps the
 * whole pick and drops the haze, and RMBG still shapes every edge.
 */
function combine(samLogits: Float32Array, background: Mask): Mask {
  const { width: w, height: h } = background
  const sam = new Float32Array(w * h)
  let picked = 0
  let agreed = 0
  for (let i = 0; i < sam.length; i++) {
    sam[i] = sigmoid(samLogits[i]!)
    if (samLogits[i]! <= 0) continue
    picked++
    if (background.data[i]! >= ALPHA_FLOOR) agreed++
  }
  const data = new Uint8ClampedArray(w * h)
  if (picked > 0 && agreed / picked < MIN_AGREEMENT) {
    for (let i = 0; i < sam.length; i++) data[i] = sam[i]! * 255
  } else {
    const r = Math.max(1, Math.round(Math.max(w, h) * SMOOTH))
    boxBlur(sam, w, h, r)
    boxBlur(sam, w, h, r)
    for (let i = 0; i < sam.length; i++) data[i] = background.data[i]! * smoothstep(KEEP_FROM, KEEP_TO, sam[i]!)
  }
  return { data, width: w, height: h }
}

/** The kept part lightly tinted and the rest dimmed, at the copy's size. */
function overlayCanvas(mask: Mask): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = mask.width
  canvas.height = mask.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  const pixels = ctx.createImageData(mask.width, mask.height)
  for (let i = 0; i < mask.width * mask.height; i++) {
    const keep = mask.data[i]! / 255
    // Mix 50% black over the rest with a 25% accent tint (#5b36d6) over the choice.
    const alpha = 0.5 * (1 - keep) + 0.25 * keep
    const tint = (0.25 * keep) / alpha
    pixels.data[i * 4] = 91 * tint
    pixels.data[i * 4 + 1] = 54 * tint
    pixels.data[i * 4 + 2] = 214 * tint
    pixels.data[i * 4 + 3] = alpha * 255
  }
  ctx.putImageData(pixels, 0, 0)
  return canvas
}

/**
 * The subject the taps point at, in a photo opened with `openSubjectPicker`. SAM offers three
 * masks per prompt, from a small part to the whole object. A tap on a shirt often scores the
 * printed logo a touch above the person wearing it, so the largest mask wins unless SAM is
 * clearly less sure of it.
 */
export async function chooseSubject(imageId: string, points: SubjectPoint[]): Promise<SubjectChoice> {
  if (session?.imageId !== imageId) throw new Error('Open the subject picker on this photo first')
  const s = await session.ready
  const { Tensor } = await import('@huggingface/transformers')
  const [reshapedH, reshapedW] = s.reshapedSizes[0]!
  const kx = reshapedW / s.width
  const ky = reshapedH / s.height
  const input_points = new Tensor(
    'float32',
    Float32Array.from(points.flatMap((p) => [p.x * kx, p.y * ky])),
    [1, 1, points.length, 2],
  )
  const input_labels = new Tensor(
    'int64',
    BigInt64Array.from(points.map((p) => (p.keep ? 1n : 0n))),
    [1, 1, points.length],
  )
  const out = await s.sam.model({ ...s.embeddings, input_points, input_labels })
  const [masks] = (await s.sam.processor.post_process_masks(out.pred_masks, s.originalSizes, s.reshapedSizes, {
    binarize: false,
  })) as Tensor[]
  const plane = s.background.width * s.background.height
  const all = masks!.data as Float32Array
  const candidates = Array.from(out.iou_scores.data as Float32Array, (score, i) => {
    let area = 0
    for (let k = i * plane; k < (i + 1) * plane; k++) if (all[k]! > 0) area++
    return { i, score, area }
  })
  const top = Math.max(...candidates.map((c) => c.score))
  const best = candidates
    .filter((c) => c.score >= top - SCORE_SLACK)
    .reduce((a, b) => (b.area > a.area ? b : a))
  const logits = all.subarray(best.i * plane, (best.i + 1) * plane)
  const mask = combine(logits, s.background)
  return { mask, overlay: overlayCanvas(mask) }
}
