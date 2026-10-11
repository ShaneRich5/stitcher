import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'
import wasmLoader from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinary from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import wasmLoaderNoSimd from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url'
import wasmBinaryNoSimd from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url'
import type { Box } from './carousel'
import { getImage } from './image-registry'

/**
 * Face boxes with MediaPipe's BlazeFace (short range), found once per image and cached by
 * `imageId`. The module is imported on first use; its wasm ships with the app (so it always
 * matches the package), and the 230 KB model comes from Google's model storage. BlazeFace sees
 * a 128 px input, which loses the small faces of a group photo, so each image is searched whole
 * and in overlapping tiles, and the hits are merged.
 */
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
const MIN_SCORE = 0.6
/** Square tiles this fraction of the image's short side: the whole image, then halves, then quarters. */
const TILE_SCALES = [1, 0.5, 0.25]
/** Neighboring tiles overlap by at least this fraction, so a face cut by one tile is whole in another. */
const TILE_OVERLAP = 0.25
/** Tiles smaller than this in source pixels would only be upscaled, so they're skipped. */
const MIN_TILE = 160
/** The model's input size; tiles are drawn at it. */
const TILE_PX = 128
/** Hits this close to a tile side that isn't the image's own side may be cut off, so they're dropped. */
const EDGE_SLACK = 0.02

let detector: Promise<FaceDetector> | null = null

function getDetector(): Promise<FaceDetector> {
  if (!detector) {
    const loading = (async () => {
      const simd = await FilesetResolver.isSimdSupported()
      return FaceDetector.createFromOptions(
        simd
          ? { wasmLoaderPath: wasmLoader, wasmBinaryPath: wasmBinary }
          : { wasmLoaderPath: wasmLoaderNoSimd, wasmBinaryPath: wasmBinaryNoSimd },
        {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          minDetectionConfidence: MIN_SCORE,
        },
      )
    })()
    detector = loading
    // Forget a failed load so the next attempt starts over.
    loading.catch(() => {
      if (detector === loading) detector = null
    })
  }
  return detector
}

/** Evenly spaced starts for tiles of `size` along `length`, overlapping by at least TILE_OVERLAP. */
function tileStarts(length: number, size: number): number[] {
  if (size >= length) return [0]
  const n = Math.ceil((length - size) / (size * (1 - TILE_OVERLAP))) + 1
  return Array.from({ length: n }, (_, i) => Math.round((i * (length - size)) / (n - 1)))
}

function tiles(width: number, height: number): Box[] {
  const short = Math.min(width, height)
  return TILE_SCALES.flatMap((scale, i) => {
    const size = Math.round(short * scale)
    if (i > 0 && size < MIN_TILE) return []
    return tileStarts(height, size).flatMap((y) =>
      tileStarts(width, size).map((x) => ({ x, y, width: size, height: size })),
    )
  })
}

function overlap(a: Box, b: Box) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  const inter = w > 0 && h > 0 ? w * h : 0
  const areaA = a.width * a.height
  const areaB = b.width * b.height
  return { iou: inter / (areaA + areaB - inter), ofSmaller: inter / Math.min(areaA, areaB) }
}

/** Keep the most confident of each group of hits on the same face. */
function merge(hits: (Box & { score: number })[]): Box[] {
  const kept: Box[] = []
  for (const hit of [...hits].sort((a, b) => b.score - a.score)) {
    const dup = kept.some((k) => {
      const o = overlap(k, hit)
      return o.iou > 0.3 || o.ofSmaller > 0.6
    })
    if (!dup) kept.push({ x: hit.x, y: hit.y, width: hit.width, height: hit.height })
  }
  return kept
}

async function findFaces(image: HTMLImageElement): Promise<Box[]> {
  const face = await getDetector()
  const width = image.naturalWidth
  const height = image.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = TILE_PX
  canvas.height = TILE_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.imageSmoothingQuality = 'high'

  const hits: (Box & { score: number })[] = []
  let sinceYield = 0
  for (const tile of tiles(width, height)) {
    const k = tile.width / TILE_PX
    ctx.clearRect(0, 0, TILE_PX, TILE_PX)
    ctx.drawImage(image, tile.x, tile.y, tile.width, tile.height, 0, 0, TILE_PX, TILE_PX)
    const slack = TILE_PX * EDGE_SLACK
    for (const d of face.detect(canvas).detections) {
      const b = d.boundingBox
      if (!b) continue
      // A hit against an inner tile side may be part of a face; a neighboring tile has all of it.
      if (
        (tile.x > 0 && b.originX < slack) ||
        (tile.y > 0 && b.originY < slack) ||
        (tile.x + tile.width < width && b.originX + b.width > TILE_PX - slack) ||
        (tile.y + tile.height < height && b.originY + b.height > TILE_PX - slack)
      ) {
        continue
      }
      hits.push({
        x: tile.x + b.originX * k,
        y: tile.y + b.originY * k,
        width: b.width * k,
        height: b.height * k,
        score: d.categories[0]?.score ?? 0,
      })
    }
    // Hand the main thread back now and then, so a big photo doesn't freeze the editor.
    if (++sinceYield >= 8) {
      sinceYield = 0
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  return merge(hits)
}

const found = new Map<string, Promise<Box[]>>()

/** The faces in a registered image, in its own pixels. Each image is searched once. */
export function detectFaces(imageId: string): Promise<Box[]> {
  let result = found.get(imageId)
  if (!result) {
    const image = getImage(imageId)?.image
    if (!image) return Promise.reject(new Error('That image is no longer loaded'))
    result = findFaces(image)
    found.set(imageId, result)
    // A failed search (say, offline) can be tried again later.
    result.catch(() => found.delete(imageId))
  }
  return result
}
