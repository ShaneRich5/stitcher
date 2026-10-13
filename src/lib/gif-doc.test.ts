import { describe, expect, it } from 'vitest'
import {
  createGifDoc,
  delayFromFps,
  letterboxedFrames,
  outputSize,
  softFrames,
  speedPresetFor,
  SPEED_PRESETS,
  type GifDoc,
} from './gif-doc'
import type { GifFrame } from '../types'

const frame = (id: string, naturalWidth: number, naturalHeight: number): GifFrame => ({
  id,
  name: `${id}.jpg`,
  imageId: id,
  naturalWidth,
  naturalHeight,
})

const withFrames = (...frames: GifFrame[]): GifDoc => ({ ...createGifDoc(), frames })

describe('speedPresetFor', () => {
  it('names the default speed Steady', () => {
    expect(speedPresetFor(createGifDoc().delayMs)).toBe('steady')
  })

  it('matches every preset it offers', () => {
    for (const p of SPEED_PRESETS) expect(speedPresetFor(delayFromFps(p.fps))).toBe(p.id)
  })

  it('is null for a rate only Studio offers', () => {
    expect(speedPresetFor(delayFromFps(24))).toBeNull()
  })
})

describe('outputSize', () => {
  it('fits the largest frame each way inside the long edge', () => {
    // The box is 1600 x 1350, scaled so 1600 becomes 720.
    expect(outputSize([frame('a', 1080, 1350), frame('b', 1600, 900)], 720)).toEqual({ width: 720, height: 608 })
  })

  it('never scales up past the frames themselves', () => {
    expect(outputSize([frame('a', 400, 500)], 1080)).toEqual({ width: 400, height: 500 })
  })
})

describe('letterboxedFrames', () => {
  it('finds frames of another shape than the output', () => {
    const doc = withFrames(frame('a', 1080, 1350), frame('b', 1080, 1350), frame('wide', 1600, 400))
    // The box is 1600 x 1350, so every frame gets bars.
    expect(letterboxedFrames(doc).map((f) => f.id)).toEqual(['a', 'b', 'wide'])
  })

  it('is empty when every frame shares one shape', () => {
    expect(letterboxedFrames(withFrames(frame('a', 1080, 1350), frame('b', 2160, 2700)))).toEqual([])
  })
})

describe('softFrames', () => {
  it('finds a small photo among bigger ones', () => {
    const doc = { ...withFrames(frame('big', 2160, 2700), frame('small', 432, 540)), maxSize: 1080 }
    expect(softFrames(doc).map((f) => f.id)).toEqual(['small'])
  })

  it('is empty when the frames are big enough', () => {
    expect(softFrames(withFrames(frame('a', 1080, 1350)))).toEqual([])
  })
})
