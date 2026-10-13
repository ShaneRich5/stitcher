import type { GifFrame } from '../types'

/**
 * Frames on their way from one tool to another, e.g. carousel slides opened in the GIF tool. They
 * pass in memory, not in the URL: the frames' images are already in the image registry, and only
 * their plain-data descriptions wait here until the receiving tool takes them.
 */
export type FrameHandoff = { frames: GifFrame[]; maxSize: number }

let pending: FrameHandoff | null = null

export function handOffFrames(handoff: FrameHandoff): void {
  pending = handoff
}

/** The frames waiting, without taking them, so a state initializer can run twice safely. */
export function peekHandoff(): FrameHandoff | null {
  return pending
}

/** Call once the receiving tool has the frames. */
export function clearHandoff(): void {
  pending = null
}
