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
  /** 0–1: how far each subject pushes in ahead of its background, a two-plane parallax. 0 is off. */
  parallax: number
  format: VideoExportFormat
}

export const COLLAGE_FPS = 30

/** Subjects settle into place from this far below (a fraction of the frame height) as they fade in. */
const RISE = 0.025
/**
 * How much a photo's background and its subject grow over their move at full parallax. The
 * subject grows more, as if nearer the camera. The background still holds the subject (nothing
 * fills the gap), so the moves stay small, and both zoom around the subject's center, so the
 * cutout grows over its own ghost instead of sliding off it.
 */
const PARALLAX_BACKGROUND_ZOOM = 0.04
const PARALLAX_SUBJECT_ZOOM = 0.12
/** Cutouts are read at most this size on their long edge to find the subject's center. */
const ANCHOR_SAMPLE = 128

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
    parallax: 0.5,
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

function easeInOut(p: number): number {
  return 0.5 - Math.cos(Math.PI * p) / 2
}

type Box = { x: number; y: number; width: number; height: number }

/** The photo covers the frame, centered. Its cutout uses the same box, so the subject stays put. */
function coverBox(item: CollageItem, width: number, height: number): Box {
  const w = Math.max(1, item.naturalWidth)
  const h = Math.max(1, item.naturalHeight)
  const scale = Math.max(width / w, height / h)
  return { x: (width - w * scale) / 2, y: (height - h * scale) / 2, width: w * scale, height: h * scale }
}

/** `box` scaled by `zoom` around the point (ax, ay). */
function zoomBox(box: Box, zoom: number, ax: number, ay: number): Box {
  return {
    x: ax + (box.x - ax) * zoom,
    y: ay + (box.y - ay) * zoom,
    width: box.width * zoom,
    height: box.height * zoom,
  }
}

const anchors = new Map<string, { x: number; y: number }>()

/** The center of a cutout's opaque pixels, as fractions of its size. Read once per cutout. */
function subjectAnchor(cutoutId: string, cutout: HTMLImageElement): { x: number; y: number } {
  const hit = anchors.get(cutoutId)
  if (hit) return hit
  const scale = Math.min(1, ANCHOR_SAMPLE / Math.max(1, cutout.naturalWidth, cutout.naturalHeight))
  const w = Math.max(1, Math.round(cutout.naturalWidth * scale))
  const h = Math.max(1, Math.round(cutout.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  let anchor = { x: 0.5, y: 0.5 }
  if (ctx) {
    ctx.drawImage(cutout, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)
    let sum = 0
    let sx = 0
    let sy = 0
    for (let i = 0; i < w * h; i++) {
      const a = data[i * 4 + 3]!
      sum += a
      sx += a * (i % w)
      sy += a * Math.floor(i / w)
    }
    if (sum > 0) anchor = { x: (sx / sum + 0.5) / w, y: (sy / sum + 0.5) / h }
  }
  anchors.set(cutoutId, anchor)
  return anchor
}

/**
 * How far item `index`'s parallax move has come, 0–1. It runs from its subject appearing until
 * the next photo's background has covered its own (the end of the video for the last one), and
 * holds after that.
 */
function parallaxProgress(doc: CollageDoc, index: number, timeMs: number): number {
  const start = itemStartMs(doc, index)
  const end = index < doc.items.length - 1 ? itemSettledMs(doc, index + 1) : collageDurationMs(doc)
  return easeInOut(progress(timeMs - start, end - start))
}

/**
 * Draw the collage as it looks at `timeMs`, in a context whose coordinates are the doc's output
 * size. The preview and the video export both draw through this, so they match.
 */
export function drawCollageFrame(ctx: CanvasRenderingContext2D, doc: CollageDoc, timeMs: number): void {
  const { width, height, items } = doc
  const cutoutOf = (item: CollageItem) => (item.cutoutId ? getImage(item.cutoutId)?.image : undefined)

  /** Where item `i`'s photo and subject are drawn now, each zoomed around the subject's center. */
  const placement = (i: number) => {
    const item = items[i]!
    const box = coverBox(item, width, height)
    if (doc.parallax <= 0) return { background: box, subject: box }
    const cutout = cutoutOf(item)
    const anchor = cutout && item.cutoutId ? subjectAnchor(item.cutoutId, cutout) : { x: 0.5, y: 0.5 }
    const ax = box.x + anchor.x * box.width
    const ay = box.y + anchor.y * box.height
    const move = doc.parallax * parallaxProgress(doc, i, timeMs)
    return {
      background: zoomBox(box, 1 + PARALLAX_BACKGROUND_ZOOM * move, ax, ay),
      subject: zoomBox(box, 1 + PARALLAX_SUBJECT_ZOOM * move, ax, ay),
    }
  }

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
    const box = placement(i).background
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
    const cutout = cutoutOf(items[i]!)
    if (!cutout) continue
    const box = placement(i).subject
    ctx.globalAlpha = p
    ctx.drawImage(cutout, box.x, box.y + (1 - easeOut(p)) * height * RISE, box.width, box.height)
  }
  ctx.restore()
}
