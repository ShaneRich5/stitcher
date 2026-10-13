import { describe, expect, it } from 'vitest'
import { fitSlices } from './welcome-preview'

const box = { width: 1040, height: 236 }
const GAP = 12
const SCENE = 960 / 300

describe('fitSlices', () => {
  it('caps tall slides at the box height', () => {
    const l = fitSlices(3, 4 / 5, box, GAP, SCENE)
    expect(l.slideH).toBe(236)
    expect(l.slideW).toBeCloseTo(188.8)
  })

  it('shrinks slides so a long row still fits the box width', () => {
    const l = fitSlices(10, 1.91, box, GAP, SCENE)
    expect(l.slideW * 10 + GAP * 9).toBeCloseTo(box.width)
    expect(l.slideH).toBeLessThan(box.height)
  })

  it('covers the whole row with the scene, centred', () => {
    for (const [count, ratio] of [
      [2, 9 / 16],
      [5, 4 / 5],
      [10, 16 / 9],
    ]) {
      const l = fitSlices(count, ratio, box, GAP, SCENE)
      const rowW = l.slideW * count
      expect(l.sceneW).toBeGreaterThanOrEqual(rowW - 1e-9)
      expect(l.sceneH).toBeGreaterThanOrEqual(l.slideH - 1e-9)
      expect(l.sceneW / l.sceneH).toBeCloseTo(SCENE)
      expect(l.sceneX).toBeCloseTo((rowW - l.sceneW) / 2)
      expect(l.sceneY).toBeCloseTo((l.slideH - l.sceneH) / 2)
    }
  })

  it('collapses to nothing in a box too small to hold the gaps', () => {
    const l = fitSlices(10, 1, { width: 50, height: 100 }, GAP, SCENE)
    expect(l.slideW).toBe(0)
    expect(l.slideH).toBe(0)
  })
})
