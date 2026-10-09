import type { VideoExportFormat } from './encode-video'
import { getImage } from './image-registry'
import type { CollageItem } from '../types'

/**
 * A video collage. Each photo's subject is cut out and appears on top of the subjects before it,
 * then the photo itself fades in behind the stack as the new background, a beat later. The next
 * subject follows `stepMs` after the last one.
 */
export type CollageDoc = {
  items: CollageItem[]
  /** Output size in pixels, from the format presets. */
  width: number
  height: number
  /** Time from one subject appearing to the next. */
  stepMs: number
  /** How long after its subject a photo's background starts to fade in. */
  backgroundDelayMs: number
  /** Length of each fade, for subjects and backgrounds alike. */
  fadeMs: number
  /** Extra time on the finished stack at the end. */
  holdEndMs: number
  /** Shown before the first background, and laid over the backgrounds at `dim` strength. */
  overlay: string
  /** 0–1: how strongly the overlay color covers the backgrounds, so the subjects stand out. */
  dim: number
  format: VideoExportFormat
}

export const COLLAGE_FPS = 30

/** Subjects settle into place from this far below (a fraction of the frame height) as they fade in. */
const RISE = 0.025

export function createCollageDoc(): CollageDoc {
  return {
    items: [],
    width: 1080,
    height: 1920,
    stepMs: 1500,
    backgroundDelayMs: 700,
    fadeMs: 450,
    holdEndMs: 1500,
    overlay: '#000000',
    dim: 0.25,
    format: 'mp4',
  }
}

/** Ends once the last background is in and the end hold has passed. */
export function collageDurationMs(doc: CollageDoc): number {
  const n = doc.items.length
  if (!n) return 0
  return (n - 1) * doc.stepMs + doc.backgroundDelayMs + doc.fadeMs + doc.holdEndMs
}

/** When item `index`'s subject starts to appear. */
export function itemStartMs(doc: CollageDoc, index: number): number {
  return index * doc.stepMs
}

/** The moment item `index`'s step is complete: its subject and its background both fully in. */
export function itemSettledMs(doc: CollageDoc, index: number): number {
  return Math.min(collageDurationMs(doc), itemStartMs(doc, index) + doc.backgroundDelayMs + doc.fadeMs)
}

/** The item whose subject appeared most recently at `timeMs`. */
export function itemIndexAt(doc: CollageDoc, timeMs: number): number {
  return Math.max(0, Math.min(doc.items.length - 1, Math.floor(timeMs / Math.max(1, doc.stepMs))))
}

export function patchItem(doc: CollageDoc, id: string, patch: Partial<CollageItem>): CollageDoc {
  return { ...doc, items: doc.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) }
}

export function removeItem(doc: CollageDoc, id: string): CollageDoc {
  return { ...doc, items: doc.items.filter((item) => item.id !== id) }
}

export function moveItem(doc: CollageDoc, from: number, to: number): CollageDoc {
  if (from === to || from < 0 || to < 0 || from >= doc.items.length || to >= doc.items.length) return doc
  const items = [...doc.items]
  const [moved] = items.splice(from, 1)
  items.splice(to, 0, moved!)
  return { ...doc, items }
}

function progress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return elapsedMs >= 0 ? 1 : 0
  return Math.min(1, Math.max(0, elapsedMs / durationMs))
}

function easeOut(p: number): number {
  return 1 - (1 - p) ** 3
}

/** The photo covers the frame, centered. Its cutout uses the same box, so the subject stays put. */
function coverBox(item: CollageItem, width: number, height: number) {
  const w = Math.max(1, item.naturalWidth)
  const h = Math.max(1, item.naturalHeight)
  const scale = Math.max(width / w, height / h)
  return { x: (width - w * scale) / 2, y: (height - h * scale) / 2, width: w * scale, height: h * scale }
}

/**
 * Draw the collage as it looks at `timeMs`, in a context whose coordinates are the doc's output
 * size. The preview and the video export both draw through this, so they match.
 */
export function drawCollageFrame(ctx: CanvasRenderingContext2D, doc: CollageDoc, timeMs: number): void {
  const { width, height, items } = doc
  ctx.save()
  ctx.imageSmoothingQuality = 'high'
  ctx.globalAlpha = 1
  ctx.fillStyle = doc.overlay
  ctx.fillRect(0, 0, width, height)

  // Backgrounds cross-fade in order. The newest one that is fully in hides the rest, so start there.
  const backgroundAlpha = (i: number) =>
    progress(timeMs - itemStartMs(doc, i) - doc.backgroundDelayMs, doc.fadeMs)
  let first = 0
  for (let i = items.length - 1; i > 0; i--) {
    if (backgroundAlpha(i) >= 1) {
      first = i
      break
    }
  }
  for (let i = first; i < items.length; i++) {
    const alpha = backgroundAlpha(i)
    if (alpha <= 0) break
    const item = items[i]!
    const photo = getImage(item.imageId)?.image
    if (!photo) continue
    const box = coverBox(item, width, height)
    ctx.globalAlpha = alpha
    ctx.drawImage(photo, box.x, box.y, box.width, box.height)
  }

  if (doc.dim > 0) {
    ctx.globalAlpha = doc.dim
    ctx.fillRect(0, 0, width, height)
  }

  // Subjects stack: each fades in over the ones before it, rising slightly into place.
  for (let i = 0; i < items.length; i++) {
    const p = progress(timeMs - itemStartMs(doc, i), doc.fadeMs)
    if (p <= 0) break
    const item = items[i]!
    const cutout = item.cutoutId ? getImage(item.cutoutId)?.image : undefined
    if (!cutout) continue
    const box = coverBox(item, width, height)
    ctx.globalAlpha = p
    ctx.drawImage(cutout, box.x, box.y + (1 - easeOut(p)) * height * RISE, box.width, box.height)
  }
  ctx.restore()
}
