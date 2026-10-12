import { getImage } from './image-registry'
import { gradePixels, grainSeed, isNeutralLook, lookKey, NEUTRAL_LOOK, withFilm } from './film-looks'
import type { FilmLookId, Layer, LayerLook, LayerShadow } from '../types'

/**
 * Outline, shadow, blur and look for image layers. Each is drawn by `drawLayerContent`, which both
 * the stage and `renderSlide` call, so the editor, the thumbnails and the export match. The outline,
 * the blur and the graded look are built once into canvases and cached, so redraws stay cheap.
 */

/** The widest outline, in world pixels. Outline canvases are padded by this much on every side. */
export const OUTLINE_MAX = 40
/** Pixels in an outline's distance field. Bigger layers get a coarser field, stretched to fit. */
const OUTLINE_MAX_AREA = 2_000_000
/** Blurs run on a copy small enough that the radius there is about this many pixels... */
const BLUR_DETAIL = 4
/** ...and no bigger than this, since blur hides the detail a larger copy would keep. */
const BLUR_MAX_AREA = 1_000_000
/** Graded copies are at least this many pixels (or the photo's own), so small draws share one. */
const LOOK_MIN_AREA = 1_000_000
/** A copy with grain can outgrow its photo, to keep the grain fine on a stretched one, up to this. */
const LOOK_MAX_AREA = 24_000_000
/** Pixels of graded copies kept in all. A whole carousel can share one look, so it's a budget. */
const LOOK_CACHE_PIXELS = 32_000_000
/** A grain's size in world pixels, so it looks the same on every slide whatever the photo's size. */
const GRAIN_SIZE = 1.5
const SWATCH_SIZE = 120
const CACHE_SIZE = 4
const FAR = 1e20

function cached<V>(cache: Map<string, V>, key: string, make: () => V, size = CACHE_SIZE): V {
  const hit = cache.get(key)
  if (hit !== undefined) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const value = make()
  cache.set(key, value)
  if (cache.size > size) cache.delete(cache.keys().next().value!)
  return value
}

function canvas2d(
  width: number,
  height: number,
  willReadFrequently = false,
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently })
  if (!ctx) throw new Error('Canvas is not available')
  ctx.imageSmoothingQuality = 'high'
  return [canvas, ctx]
}

// ---------- blur ----------

/** Widths of three box blurs that together approximate a Gaussian with this sigma. */
function boxWidths(sigma: number): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / 3 + 1)
  let lower = Math.floor(ideal)
  if (lower % 2 === 0) lower--
  const lowerCount = Math.round((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4))
  return [0, 1, 2].map((i) => (i < lowerCount ? lower : lower + 2))
}

/**
 * One box-blur pass over RGBA floats: `lines` runs of `n` pixels, `step` apart within a run and
 * `lineStep` apart between runs. Edges repeat their last pixel, so a photo's border doesn't fade.
 */
function boxPass(
  src: Float32Array,
  dst: Float32Array,
  lines: number,
  lineStep: number,
  n: number,
  step: number,
  r: number,
) {
  const inv = 1 / (2 * r + 1)
  const last = n - 1
  for (let line = 0; line < lines; line++) {
    for (let c = 0; c < 4; c++) {
      const base = line * lineStep + c
      let sum = src[base]! * (r + 1)
      for (let k = 1; k <= r; k++) sum += src[base + Math.min(k, last) * step]!
      for (let i = 0; i < n; i++) {
        dst[base + i * step] = sum * inv
        sum += src[base + Math.min(i + r + 1, last) * step]! - src[base + Math.max(i - r, 0) * step]!
      }
    }
  }
}

/** Gaussian blur in place. Works on premultiplied color, so transparent pixels don't darken edges. */
function gaussianBlur(image: ImageData, sigma: number) {
  const { width: w, height: h, data } = image
  const a = new Float32Array(w * h * 4)
  const b = new Float32Array(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]! / 255
    a[i] = data[i]! * alpha
    a[i + 1] = data[i + 1]! * alpha
    a[i + 2] = data[i + 2]! * alpha
    a[i + 3] = data[i + 3]!
  }
  for (const width of boxWidths(sigma)) {
    const r = (width - 1) / 2
    if (r < 1) continue
    boxPass(a, b, h, w * 4, w, 4, r)
    boxPass(b, a, w, 4, h, w * 4, r)
  }
  for (let i = 0; i < data.length; i += 4) {
    const alpha = a[i + 3]!
    const k = alpha > 0 ? 255 / alpha : 0
    data[i] = a[i]! * k
    data[i + 1] = a[i + 1]! * k
    data[i + 2] = a[i + 2]! * k
    data[i + 3] = alpha
  }
}

const blurCache = new Map<string, HTMLCanvasElement>()

/** The image blurred by `radius` world pixels at the layer's size, from a small copy. */
function blurredImage(layer: Layer, image: CanvasImageSource, radius: number): HTMLCanvasElement {
  const scale = Math.min(1, BLUR_DETAIL / radius, Math.sqrt(BLUR_MAX_AREA / (layer.width * layer.height)))
  const w = Math.max(1, Math.round(layer.width * scale))
  const h = Math.max(1, Math.round(layer.height * scale))
  const sigma = (radius * w) / layer.width
  return cached(blurCache, `${layer.imageId}|${w}x${h}|${sigma.toFixed(2)}`, () => {
    const [canvas, ctx] = canvas2d(w, h)
    ctx.drawImage(image, 0, 0, w, h)
    const pixels = ctx.getImageData(0, 0, w, h)
    gaussianBlur(pixels, sigma)
    ctx.putImageData(pixels, 0, 0)
    return canvas
  })
}

// ---------- outline ----------

/** Felzenszwalb–Huttenlocher squared distance transform of one line, `f` into `d`. */
function distance1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0
  v[0] = 0
  z[0] = -FAR
  z[1] = FAR
  for (let q = 1; q < n; q++) {
    let s: number
    for (;;) {
      const p = v[k]!
      s = (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p)
      if (s > z[k]! || k === 0) break
      k--
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = FAR
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++
    const p = v[k]!
    d[q] = (q - p) * (q - p) + f[p]!
  }
}

/** Squared distance from each pixel to the nearest opaque one (alpha at least half). */
function distanceField(alpha: ImageData): Float32Array {
  const { width: w, height: h, data } = alpha
  const field = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) field[i] = data[i * 4 + 3]! >= 128 ? 0 : FAR
  const n = Math.max(w, h)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = field[y * w + x]!
    distance1d(f, h, d, v, z)
    for (let y = 0; y < h; y++) field[y * w + x] = d[y]!
  }
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) f[x] = field[row + x]!
    distance1d(f, w, d, v, z)
    for (let x = 0; x < w; x++) field[row + x] = d[x]!
  }
  return field
}

type Field = { field: Float32Array; w: number; h: number; scale: number }
type Silhouette = { canvas: HTMLCanvasElement; width: number; height: number }

const fieldCache = new Map<string, Field>()
const outlineCache = new Map<string, Silhouette>()

/**
 * A filled silhouette of the image grown by `width` world pixels, on a canvas covering the
 * layer's box plus OUTLINE_MAX on every side. Neither Konva nor the canvas API can stroke an
 * image's transparent edge, so the outline is a distance field around the opaque pixels,
 * thresholded at the width. The field doesn't depend on the width, so changing it is cheap.
 */
function outlineSilhouette(
  layer: Layer,
  source: CanvasImageSource,
  sourceKey: string,
  width: number,
  color: string,
): Silhouette {
  const fullW = layer.width + 2 * OUTLINE_MAX
  const fullH = layer.height + 2 * OUTLINE_MAX
  const scale = Math.min(1, Math.sqrt(OUTLINE_MAX_AREA / (fullW * fullH)))
  const w = Math.max(1, Math.ceil(fullW * scale))
  const h = Math.max(1, Math.ceil(fullH * scale))
  const fieldKey = `${sourceKey}|${w}x${h}`

  const { field } = cached(fieldCache, fieldKey, () => {
    const [, ctx] = canvas2d(w, h, true)
    ctx.drawImage(source, OUTLINE_MAX * scale, OUTLINE_MAX * scale, layer.width * scale, layer.height * scale)
    return { field: distanceField(ctx.getImageData(0, 0, w, h)), w, h, scale }
  })

  return cached(outlineCache, `${fieldKey}|${width.toFixed(1)}|${color}`, () => {
    const [canvas, ctx] = canvas2d(w, h)
    const pixels = ctx.createImageData(w, h)
    // A one-pixel ramp past the width antialiases the outer edge.
    const reach = width * scale + 1
    for (let i = 0; i < field.length; i++) {
      const a = reach - Math.sqrt(field[i]!)
      pixels.data[i * 4 + 3] = a >= 1 ? 255 : a > 0 ? a * 255 : 0
    }
    ctx.putImageData(pixels, 0, 0)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    return { canvas, width: w / scale, height: h / scale }
  })
}

// ---------- shadow ----------

/** `#rgb` / `#rrggbb` with an alpha, as rgba(). */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex)
  if (!m) return `rgba(0, 0, 0, ${alpha})`
  const digits = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!
  const n = Number.parseInt(digits, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Canvas shadows ignore the transform, so world pixels are converted to canvas pixels here. */
function applyShadow(ctx: CanvasRenderingContext2D, shadow: LayerShadow, pxPerWorld: number) {
  ctx.shadowColor = withAlpha(shadow.color, shadow.opacity)
  ctx.shadowBlur = shadow.blur * pxPerWorld
  ctx.shadowOffsetX = shadow.offsetX * pxPerWorld
  ctx.shadowOffsetY = shadow.offsetY * pxPerWorld
}

// ---------- look ----------

const lookCache = new Map<string, HTMLCanvasElement>()
let lookCachePixels = 0

/**
 * A copy of `source` with the look applied, in the photo's own shape (the box stretches it, as it
 * does the photo). It's as large as it's drawn, in steps of √2 so resizing a layer rarely regrades
 * it, and no larger than the photo unless it has grain. The vignette is relative to the photo and
 * the grain to the world, so a smaller copy looks like the export, only softer.
 */
function gradedImage(
  layer: Layer,
  source: CanvasImageSource,
  sourceKey: string,
  look: LayerLook,
  pxPerWorld: number,
): HTMLCanvasElement {
  const natural = layer.naturalWidth * layer.naturalHeight
  const most = look.grain ? Math.max(natural, LOOK_MAX_AREA) : natural
  const drawn = layer.width * layer.height * pxPerWorld * pxPerWorld
  const wanted = Math.sqrt(Math.min(most, Math.max(drawn, LOOK_MIN_AREA)) / natural)
  const step = Math.SQRT2 ** Math.ceil(Math.log(wanted) / Math.log(Math.SQRT2))
  const scale = Math.min(Math.sqrt(most / natural), step)
  const w = Math.max(1, Math.round(layer.naturalWidth * scale))
  const h = Math.max(1, Math.round(layer.naturalHeight * scale))
  // The grain in copy pixels, in 10% steps, so it too only regrades now and then on a resize.
  const perWorld = Math.sqrt((w * h) / (layer.width * layer.height))
  const grainCell = 1.1 ** Math.round(Math.log(GRAIN_SIZE * perWorld) / Math.log(1.1))
  const key = `${sourceKey}|${w}x${h}|${lookKey(look)}|${look.grain ? grainCell.toFixed(3) : ''}`

  const hit = lookCache.get(key)
  if (hit) {
    lookCache.delete(key)
    lookCache.set(key, hit)
    return hit
  }
  const [canvas, ctx] = canvas2d(w, h, true)
  ctx.drawImage(source, 0, 0, w, h)
  const pixels = ctx.getImageData(0, 0, w, h)
  gradePixels(pixels.data, w, h, look, grainSeed(layer.imageId), grainCell)
  ctx.putImageData(pixels, 0, 0)

  lookCache.set(key, canvas)
  lookCachePixels += w * h
  for (const [oldKey, old] of lookCache) {
    if (lookCachePixels <= LOOK_CACHE_PIXELS || old === canvas) break
    lookCache.delete(oldKey)
    lookCachePixels -= old.width * old.height
    // Safari keeps a canvas's memory until it's collected; emptying it frees that now.
    old.width = 0
    old.height = 0
  }
  return canvas
}

const swatchCache = new Map<string, string>()

/** A small square of the layer's photo in a preset (or none), as a data URL for the look picker. */
export function lookSwatch(layer: Layer, film: FilmLookId | null): string | undefined {
  const image = getImage(layer.imageId)?.image
  if (!image) return undefined
  const make = () => {
    const [canvas, ctx] = canvas2d(SWATCH_SIZE, SWATCH_SIZE, true)
    const side = Math.min(layer.naturalWidth, layer.naturalHeight)
    const sx = (layer.naturalWidth - side) / 2
    const sy = (layer.naturalHeight - side) / 2
    ctx.drawImage(image, sx, sy, side, side, 0, 0, SWATCH_SIZE, SWATCH_SIZE)
    const look = withFilm(NEUTRAL_LOOK, film)
    if (!isNeutralLook(look)) {
      const pixels = ctx.getImageData(0, 0, SWATCH_SIZE, SWATCH_SIZE)
      const grainCell = (GRAIN_SIZE * SWATCH_SIZE) / Math.min(layer.width, layer.height)
      gradePixels(pixels.data, SWATCH_SIZE, SWATCH_SIZE, look, grainSeed(layer.imageId), grainCell)
      ctx.putImageData(pixels, 0, 0)
    }
    return canvas.toDataURL('image/png')
  }
  return cached(swatchCache, `${layer.imageId}|${film}`, make, 40)
}

// ---------- drawing ----------

/**
 * Draw a layer into its own unrotated box, (0, 0) to (width, height), with the context already
 * moved, turned and mirrored into place: the outline first, then the image, blurred and then
 * graded. The shadow falls from the outline when there is one, otherwise from the image.
 * `pxPerWorld` is canvas pixels per world pixel. `shadow: false` skips the shadow, for the stage's
 * faded copy under the slides.
 */
export function drawLayerContent(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  pxPerWorld: number,
  { shadow = true }: { shadow?: boolean } = {},
) {
  const image = getImage(layer.imageId)?.image
  if (!image || layer.width < 1 || layer.height < 1) return
  const blur = layer.blur ?? 0
  const source = blur > 0 ? blurredImage(layer, image, blur) : image
  const sourceKey = blur > 0 ? `${layer.imageId}|blur${blur.toFixed(1)}` : layer.imageId
  const outlineWidth = Math.min(OUTLINE_MAX, layer.outline?.width ?? 0)

  ctx.save()
  if (shadow && layer.shadow && layer.shadow.opacity > 0) applyShadow(ctx, layer.shadow, pxPerWorld)
  if (layer.outline && outlineWidth > 0) {
    const silhouette = outlineSilhouette(layer, source, sourceKey, outlineWidth, layer.outline.color)
    ctx.drawImage(silhouette.canvas, -OUTLINE_MAX, -OUTLINE_MAX, silhouette.width, silhouette.height)
    ctx.shadowColor = 'transparent'
  }
  // Graded after the blur, so the grain stays sharp on a blurred background.
  const look = layer.look && !isNeutralLook(layer.look) ? layer.look : null
  const graded = look ? gradedImage(layer, source, sourceKey, look, pxPerWorld) : source
  ctx.drawImage(graded, 0, 0, layer.width, layer.height)
  ctx.restore()
}
