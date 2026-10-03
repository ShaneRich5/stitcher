import type { AnimationExportFormat } from './encode-gif'
import type { GifFrame } from '../types'

/** Everything the GIF tool needs to render and export a loop. Plain data, like `CarouselDoc`. */
export type GifDoc = {
  frames: GifFrame[]
  /** Milliseconds each frame is shown. */
  delayMs: number
  /** Extra time the last frame holds before the loop repeats. */
  holdLastMs: number
  /** Longest edge of the output, in pixels. */
  maxSize: number
  background: string
  reverse: boolean
  /** GIF only: play through once instead of looping forever. */
  loopOnce: boolean
  format: AnimationExportFormat
}

export const MIN_DELAY_MS = 40
export const MAX_DELAY_MS = 2000

/**
 * Frame rates offered in the control bar; the slider underneath covers everything between.
 * 2.5 is here so the default delay (400ms) lands on a preset rather than lighting none of them.
 */
export const FPS_PRESETS = [1, 2.5, 5, 10, 15, 24]

export function createGifDoc(): GifDoc {
  return {
    frames: [],
    delayMs: 400,
    holdLastMs: 0,
    maxSize: 720,
    background: '#000000',
    reverse: false,
    loopOnce: false,
    format: 'mp4',
  }
}

export function clampDelay(ms: number): number {
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, Math.round(ms)))
}

export function fpsFromDelay(delayMs: number): number {
  return 1000 / Math.max(1, delayMs)
}

export function delayFromFps(fps: number): number {
  return clampDelay(1000 / Math.max(0.1, fps))
}

/** Label for the current speed, e.g. "2.5 fps". Whole numbers lose the decimal. */
export function fpsLabel(delayMs: number): string {
  const fps = fpsFromDelay(delayMs)
  return `${fps >= 10 ? Math.round(fps) : Math.round(fps * 10) / 10} fps`
}

/** How long one loop runs, including the extra hold on the last frame. */
export function loopDurationMs(doc: GifDoc): number {
  return doc.frames.length * doc.delayMs + doc.holdLastMs
}

export function moveFrame(doc: GifDoc, id: string, dir: -1 | 1): GifDoc {
  const i = doc.frames.findIndex((f) => f.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= doc.frames.length) return doc
  return { ...doc, frames: reorder(doc.frames, i, j) }
}

/** Move the frame at `from` so it sits at index `to`, for drag-and-drop in the strip. */
export function reorderFrames(doc: GifDoc, from: number, to: number): GifDoc {
  if (from === to || from < 0 || to < 0 || from >= doc.frames.length || to >= doc.frames.length) {
    return doc
  }
  return { ...doc, frames: reorder(doc.frames, from, to) }
}

function reorder<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

export function removeFrame(doc: GifDoc, id: string): GifDoc {
  const frames = doc.frames.filter((f) => f.id !== id)
  return frames.length === doc.frames.length ? doc : { ...doc, frames }
}

export function duplicateFrame(doc: GifDoc, id: string): GifDoc {
  const i = doc.frames.findIndex((f) => f.id === id)
  if (i < 0) return doc
  const copy = { ...doc.frames[i]!, id: crypto.randomUUID() }
  const frames = [...doc.frames]
  frames.splice(i + 1, 0, copy)
  return { ...doc, frames }
}
