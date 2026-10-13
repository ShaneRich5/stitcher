import { describe, expect, it } from 'vitest'
import { createDoc } from './carousel'
import { leakSpots } from './light-leaks'
import type { CarouselDoc } from '../types'

function docWith(count: number, seed: number): CarouselDoc {
  return { ...createDoc(), count, lightLeaks: { amount: 0.6, color: '#ff6a1f', seed } }
}

/** The seam a spot belongs to: the nearest slide edge. */
function nearestSeam(doc: CarouselDoc, x: number): number {
  return Math.round(x / doc.slideW)
}

describe('leakSpots', () => {
  it('is the same for the same seed', () => {
    expect(leakSpots(docWith(5, 42))).toEqual(leakSpots(docWith(5, 42)))
  })

  it('moves when the seed changes', () => {
    expect(leakSpots(docWith(5, 42))).not.toEqual(leakSpots(docWith(5, 43)))
  })

  it('puts every leak across a seam, inside the row', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const doc = docWith(6, seed)
      for (const s of leakSpots(doc)) {
        const seam = nearestSeam(doc, s.x)
        expect(seam).toBeGreaterThanOrEqual(1)
        expect(seam).toBeLessThanOrEqual(5)
        // Close enough to its seam that the glow (at least 0.08 × the slide wide) crosses it.
        expect(Math.abs(s.x - seam * doc.slideW)).toBeLessThan(s.rx)
        expect(s.y).toBeGreaterThanOrEqual(0)
        expect(s.y).toBeLessThanOrEqual(doc.slideH)
      }
    }
  })

  it('always has at least one leak', () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(leakSpots(docWith(2, seed)).length).toBeGreaterThan(0)
    }
  })

  it('leaves the leaks on other seams alone when a slide is added', () => {
    const before = leakSpots(docWith(3, 7))
    const after = leakSpots(docWith(4, 7))
    expect(after.slice(0, before.length).length).toBe(before.length)
    const onFirstSeams = after.filter((s) => s.x < 2.5 * 1080)
    expect(onFirstSeams).toEqual(before.filter((s) => s.x < 2.5 * 1080))
  })

  it('brings one in from the side of a single slide', () => {
    const doc = docWith(1, 3)
    const spots = leakSpots(doc)
    expect(spots.length).toBeGreaterThan(0)
    expect([0, doc.slideW]).toContain(nearestSeam(doc, spots[0]!.x) * doc.slideW)
  })
})
