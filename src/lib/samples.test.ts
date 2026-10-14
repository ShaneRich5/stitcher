import { describe, expect, it } from 'vitest'
import { collageSampleLayout, COLLAGE_SAMPLE_PHOTOS, GIF_SAMPLE_PANS, gifSampleLayout } from './samples'

describe('gifSampleLayout', () => {
  it('makes 4:5 frames that pan right across the 4:1 sunset', () => {
    const first = gifSampleLayout(0, 1350)
    expect([first.width, first.height]).toEqual([1080, 1350])
    expect(first.sunset).toMatchObject({ y: 0, width: 5400, height: 1350 })
    expect(first.sunset.x).toBeCloseTo(0)
    const xs = GIF_SAMPLE_PANS.map((_, i) => gifSampleLayout(i, 1350).sunset.x)
    expect(xs).toEqual([...xs].sort((a, b) => b - a))
  })

  it('keeps the sunset covering every frame', () => {
    for (let i = 0; i < GIF_SAMPLE_PANS.length; i++) {
      const { width, sunset } = gifSampleLayout(i, 1350)
      expect(sunset.x).toBeLessThanOrEqual(0)
      expect(sunset.x + sunset.width).toBeGreaterThanOrEqual(width)
    }
  })

  it('brings the friend into view over the last three frames only', () => {
    const inView = GIF_SAMPLE_PANS.map((_, i) => {
      const { width, friend } = gifSampleLayout(i, 1350)
      return friend.x < width && friend.x + friend.width > 0
    })
    expect(inView).toEqual([false, false, false, true, true, true])
  })
})

describe('collageSampleLayout', () => {
  it('fills each photo with sunset and stands the friend on its bottom edge', () => {
    COLLAGE_SAMPLE_PHOTOS.forEach((_, i) => {
      const { sunset, friend } = collageSampleLayout(i, 1080, 1920)
      expect(sunset.x).toBeLessThanOrEqual(0)
      expect(sunset.x + sunset.width).toBeGreaterThanOrEqual(1080)
      expect(sunset.height).toBe(1920)
      expect(friend.y + friend.height).toBeCloseTo(1.02 * 1920)
      expect(friend.x).toBeGreaterThanOrEqual(0)
      expect(friend.x + friend.width).toBeLessThanOrEqual(1080)
    })
  })
})
