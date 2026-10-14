import type { VideoExportFormat } from './encode-video'
import { getImage } from './image-registry'
import type { CollageItem } from '../types'

/**
 * How the photos come together:
 * - `instagram`: one photo at a time. The next photo's subject arrives over the one on screen, then
 *   its photo fills in behind it as the old one fades away; after the last photo the first comes
 *   back the same way, so the video loops seamlessly.
 * - `stack`: the subjects pile up, each over the ones before, with its photo fading in behind a beat
 *   later (and, with `backgrounds: 'fade'`, back out as the next subject arrives).
 */
export type CollageStyle = 'instagram' | 'stack'

/**
 * A video collage. Each photo's subject is cut out; how subjects and photos come in is the
 * `style`. The next subject follows `stepMs` after the last one.
 */
export type CollageDoc = {
  items: CollageItem[]
  /** Output size in pixels, from the format presets. */
  width: number
  height: number
  style: CollageStyle
  /** Time from one subject appearing to the next: in Instagram style, each photo's whole turn. */
  stepMs: number
  /** How long after its subject a photo's background starts to fade in. */
  backgroundDelayMs: number
  /** Length of each fade, for subjects and backgrounds alike. */
  fadeMs: number
  /** Extra time on the finished stack at the end. Stack style only; the Instagram style loops. */
  holdEndMs: number
  /** Stack style: shown before the first background, and laid over the backgrounds at `dim` strength. */
  overlay: string
  /** 0–1: how strongly the overlay color covers the backgrounds, so the subjects stand out. */
  dim: number
  /** Stack style, 0–1: how far each subject pushes in ahead of its background, a two-plane parallax. 0 is off. */
  parallax: number
  /**
   * Stack style: what each photo does behind its subject: `fade` fades it back out as the next subject arrives
   * (the last one before the end hold), so the subjects end up stacked on the overlay color;
   * `stay` keeps it until the next photo has faded in over it, ending on the last photo.
   */
  backgrounds: 'fade' | 'stay'
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
    style: 'instagram',
    stepMs: 1500,
    backgroundDelayMs: 700,
    fadeMs: 450,
    holdEndMs: 1500,
    overlay: '#000000',
    dim: 0.25,
    parallax: 0.5,
    backgrounds: 'fade',
    format: 'mp4',
  }
}

/** How long a photo's arrival takes: its subject fades in, then its photo, `backgroundDelayMs` later. */
function arrivalLengthMs(doc: CollageDoc): number {
  return doc.backgroundDelayMs + doc.fadeMs
}

/**
 * Instagram style: each photo's turn. It's on screen alone, then the next photo arrives over it,
 * finishing as the turn ends. Never shorter than an arrival, so arrivals never overlap.
 */
export function turnMs(doc: CollageDoc): number {
  return Math.max(doc.stepMs, arrivalLengthMs(doc))
}

/**
 * Instagram style: when arrival `k` starts, the one at the end of photo `k`'s turn, bringing in
 * photo `k + 1` (photo 0 again after the last).
 */
export function arrivalMs(doc: CollageDoc, k: number): number {
  return (k + 1) * turnMs(doc) - arrivalLengthMs(doc)
}

/**
 * Stack style ends once the last background is in and the end hold has passed. Instagram style
 * ends as the first photo is back in full, a turn per photo, so the end meets the start.
 */
export function collageDurationMs(doc: CollageDoc): number {
  const n = doc.items.length
  if (!n) return 0
  if (doc.style === 'instagram') return n * turnMs(doc)
  return (n - 1) * doc.stepMs + doc.backgroundDelayMs + doc.fadeMs + doc.holdEndMs
}

/** When item `index`'s subject starts to appear. In Instagram style the first photo is there from the start. */
export function itemStartMs(doc: CollageDoc, index: number): number {
  if (doc.style === 'instagram') return index === 0 ? 0 : arrivalMs(doc, index - 1)
  return index * doc.stepMs
}

/** The moment item `index`'s step is complete: its subject and its background both fully in. */
export function itemSettledMs(doc: CollageDoc, index: number): number {
  if (doc.style === 'instagram') return index === 0 ? 0 : index * turnMs(doc)
  return Math.min(collageDurationMs(doc), itemStartMs(doc, index) + doc.backgroundDelayMs + doc.fadeMs)
}

/** The item whose subject appeared most recently at `timeMs` (in Instagram style, the one arriving or on screen). */
export function itemIndexAt(doc: CollageDoc, timeMs: number): number {
  const n = doc.items.length
  if (doc.style === 'instagram') {
    if (n < 2 || timeMs < arrivalMs(doc, 0)) return 0
    const k = Math.min(n - 1, Math.floor((timeMs - arrivalMs(doc, 0)) / turnMs(doc)))
    return (k + 1) % n
  }
  return Math.max(0, Math.min(n - 1, Math.floor(timeMs / Math.max(1, doc.stepMs))))
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

/**
 * When item `index`'s photo starts to fade back out, or null when photos stay. It goes as the next
 * subject arrives; the last one goes a step after it came, as if another were due, but always in
 * time to be gone by the end.
 */
export function backgroundOutMs(doc: CollageDoc, index: number): number | null {
  if (doc.backgrounds !== 'fade') return null
  if (index < doc.items.length - 1) return itemStartMs(doc, index + 1)
  return Math.min(itemStartMs(doc, index) + doc.stepMs, collageDurationMs(doc) - doc.fadeMs)
}

/** How visible item `index`'s photo is at `timeMs`, 0–1, before anything is drawn over it. */
export function backgroundAlpha(doc: CollageDoc, index: number, timeMs: number): number {
  const fadeIn = progress(timeMs - itemStartMs(doc, index) - doc.backgroundDelayMs, doc.fadeMs)
  const out = backgroundOutMs(doc, index)
  return out === null ? fadeIn : fadeIn * (1 - progress(timeMs - out, doc.fadeMs))
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

/** What an Instagram-style frame shows: a photo in full, and maybe the next one arriving over it. */
export type InstagramFrame = {
  /** The photo on screen, in full. */
  base: number
  /** The photo arriving, if one is: its subject's and its photo's opacity, 0–1. */
  arriving: { index: number; subject: number; photo: number } | null
}

/**
 * Instagram style at `timeMs`: the photo on screen, and the next one arriving over it. The arriving
 * subject fades in over the photo on screen, then its own photo fades in behind it, covering the
 * old one; once its photo is in, the subject is dropped, being in the photo already.
 */
export function instagramFrame(doc: CollageDoc, timeMs: number): InstagramFrame {
  const n = doc.items.length
  if (n < 2 || timeMs < arrivalMs(doc, 0)) return { base: 0, arriving: null }
  const k = Math.min(n - 1, Math.floor((timeMs - arrivalMs(doc, 0)) / turnMs(doc)))
  const start = arrivalMs(doc, k)
  const photo = progress(timeMs - start - doc.backgroundDelayMs, doc.fadeMs)
  const subject = photo >= 1 ? 0 : progress(timeMs - start, doc.fadeMs)
  return { base: k, arriving: { index: (k + 1) % n, subject, photo } }
}

/**
 * Draw the collage as it looks at `timeMs`, in a context whose coordinates are the doc's output
 * size. The preview and the video export both draw through this, so they match.
 */
export function drawCollageFrame(ctx: CanvasRenderingContext2D, doc: CollageDoc, timeMs: number): void {
  const { width, height, items } = doc
  const cutoutOf = (item: CollageItem) => (item.cutoutId ? getImage(item.cutoutId)?.image : undefined)

  if (doc.style === 'instagram') {
    ctx.save()
    ctx.imageSmoothingQuality = 'high'
    ctx.globalAlpha = 1
    ctx.fillStyle = doc.overlay
    ctx.fillRect(0, 0, width, height)
    const frame = instagramFrame(doc, timeMs)
    const drawPhoto = (i: number, alpha: number) => {
      const item = items[i]
      const photo = item && getImage(item.imageId)?.image
      if (!photo || alpha <= 0) return
      const box = coverBox(item, width, height)
      ctx.globalAlpha = alpha
      ctx.drawImage(photo, box.x, box.y, box.width, box.height)
    }
    drawPhoto(frame.base, 1)
    if (frame.arriving) {
      const { index, subject, photo } = frame.arriving
      drawPhoto(index, photo)
      const cutout = subject > 0 ? cutoutOf(items[index]!) : undefined
      if (cutout) {
        const box = coverBox(items[index]!, width, height)
        ctx.globalAlpha = subject
        ctx.drawImage(cutout, box.x, box.y + (1 - easeOut(subject)) * height * RISE, box.width, box.height)
      }
    }
    ctx.restore()
    return
  }

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

  // Backgrounds fade in order. The newest one that is fully in hides the rest, so start there.
  let first = 0
  for (let i = items.length - 1; i > 0; i--) {
    if (backgroundAlpha(doc, i, timeMs) >= 1) {
      first = i
      break
    }
  }
  for (let i = first; i < items.length; i++) {
    if (timeMs < itemStartMs(doc, i) + doc.backgroundDelayMs) break
    const alpha = backgroundAlpha(doc, i, timeMs)
    if (alpha <= 0) continue
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

/** The styles offered in Quick and Studio: the Instagram loop, and the two kinds of stack. */
export const COLLAGE_STYLES = [
  {
    id: 'instagram',
    label: 'Instagram collage',
    short: 'Instagram',
    hint: 'One photo at a time: each subject leads its photo in over the last, and it loops',
    patch: { style: 'instagram' },
  },
  {
    id: 'stack',
    label: 'Stack',
    short: 'Stack',
    hint: 'The subjects pile up while their photos fade away, ending on the subjects alone',
    patch: { style: 'stack', backgrounds: 'fade' },
  },
  {
    id: 'stack-keep',
    label: 'Stack over photos',
    short: 'Stack + photos',
    hint: 'The subjects pile up, each photo staying until the next covers it, ending on the last photo',
    patch: { style: 'stack', backgrounds: 'stay' },
  },
] as const satisfies readonly { id: string; label: string; short: string; hint: string; patch: Partial<CollageDoc> }[]

export type CollageStyleId = (typeof COLLAGE_STYLES)[number]['id']

/** Which of the offered styles the doc is in. */
export function collageStyleFor(doc: CollageDoc): CollageStyleId {
  if (doc.style === 'instagram') return 'instagram'
  return doc.backgrounds === 'fade' ? 'stack' : 'stack-keep'
}

type Pace = Pick<CollageDoc, 'stepMs' | 'backgroundDelayMs' | 'fadeMs' | 'holdEndMs'>

/** Quick's paces: the four timings together. Steady is the default doc's timing. */
export const PACE_PRESETS: { id: 'snappy' | 'steady' | 'slow'; label: string; hint: string; pace: Pace }[] = [
  { id: 'snappy', label: 'Snappy', hint: '0.9 s a photo', pace: { stepMs: 900, backgroundDelayMs: 400, fadeMs: 300, holdEndMs: 1200 } },
  { id: 'steady', label: 'Steady', hint: '1.5 s a photo', pace: { stepMs: 1500, backgroundDelayMs: 700, fadeMs: 450, holdEndMs: 1500 } },
  { id: 'slow', label: 'Slow reveal', hint: '2.4 s a photo', pace: { stepMs: 2400, backgroundDelayMs: 1100, fadeMs: 700, holdEndMs: 2000 } },
]

export type PaceId = (typeof PACE_PRESETS)[number]['id']

/** The Quick pace the doc's timing matches, or null once it's been tuned in Studio. */
export function pacePresetFor(doc: CollageDoc): PaceId | null {
  return (
    PACE_PRESETS.find(
      ({ pace }) =>
        pace.stepMs === doc.stepMs &&
        pace.backgroundDelayMs === doc.backgroundDelayMs &&
        pace.fadeMs === doc.fadeMs &&
        pace.holdEndMs === doc.holdEndMs,
    )?.id ?? null
  )
}

/**
 * When one photo's subject comes in and goes, when its background comes in, and when its background
 * is gone: faded back out, or covered by the next one. In Instagram style the first photo is also on
 * screen from the start until `leadUntilMs`.
 */
export type ItemSchedule = {
  subjectInMs: number
  subjectOutMs: number
  backgroundInMs: number
  goneMs: number
  fadesOut: boolean
  leadUntilMs: number | null
}

/**
 * Each item's moments, for drawing the sequence: its subject starts to fade in, its photo starts
 * to fade in behind, and its photo is gone again, faded out or with the next photo fully in on
 * top of it (the end, for the last one that stays).
 */
export function itemSchedule(doc: CollageDoc): ItemSchedule[] {
  const end = collageDurationMs(doc)
  const n = doc.items.length
  if (doc.style === 'instagram') {
    if (n < 2) return doc.items.map(() => ({ subjectInMs: 0, subjectOutMs: 0, backgroundInMs: 0, goneMs: end, fadesOut: false, leadUntilMs: null }))
    // Photo i arrives in arrival i - 1; the first arrives last, in arrival n - 1, to close the loop.
    return doc.items.map((_, i) => {
      const start = arrivalMs(doc, (i - 1 + n) % n)
      return {
        subjectInMs: start,
        subjectOutMs: start + arrivalLengthMs(doc),
        backgroundInMs: start + doc.backgroundDelayMs,
        goneMs: i === 0 ? end : (i + 1) * turnMs(doc),
        fadesOut: i !== 0,
        leadUntilMs: i === 0 ? turnMs(doc) : null,
      }
    })
  }
  return doc.items.map((_, i) => {
    const out = backgroundOutMs(doc, i)
    return {
      subjectInMs: itemStartMs(doc, i),
      subjectOutMs: end,
      backgroundInMs: itemStartMs(doc, i) + doc.backgroundDelayMs,
      goneMs: out !== null ? Math.min(end, out + doc.fadeMs) : i < doc.items.length - 1 ? itemSettledMs(doc, i + 1) : end,
      fadesOut: out !== null,
      leadUntilMs: null,
    }
  })
}

export type CutoutState = 'ready' | 'cutting' | 'waiting' | 'failed'

/** Where an item's cutout is up to; `cuttingId` is the one the queue is working on now. */
export function cutoutState(item: CollageItem, cuttingId: string | null): CutoutState {
  if (item.cutoutId) return 'ready'
  if (item.failed) return 'failed'
  return item.id === cuttingId ? 'cutting' : 'waiting'
}
