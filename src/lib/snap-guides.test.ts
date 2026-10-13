import { describe, expect, it } from 'vitest'
import { createDoc } from './carousel'
import { collectSnapTargets, snapBox } from './snap-guides'

const doc = { ...createDoc(), count: 2 }
const { xs, ys } = collectSnapTargets(doc)

describe('collectSnapTargets', () => {
  it('has slide edges and centers, and the top, middle and bottom', () => {
    expect(xs).toEqual([0, 540, 1080, 1620, 2160])
    expect(ys).toEqual([0, 675, 1350])
  })

  it('adds the grid cuts', () => {
    const grid = collectSnapTargets({ ...doc, gridCols: 3, gridRows: 2 })
    expect(grid.xs).toEqual([0, 360, 540, 720, 1080, 1440, 1620, 1800, 2160])
    expect(grid.ys).toEqual([0, 675, 1350])
  })
})

describe('snapBox', () => {
  it('snaps an edge within the threshold and reports its guide', () => {
    const r = snapBox({ x: 1075, y: 10, width: 100, height: 100 }, xs, ys, 8)
    expect(r.x).toBe(1080)
    expect(r.y).toBe(10)
    expect(r.guides).toEqual({ v: [1080], h: [] })
  })

  it('snaps at exactly the threshold, but not past it', () => {
    expect(snapBox({ x: 1072, y: 400, width: 100, height: 100 }, xs, ys, 8).x).toBe(1080)
    const past = snapBox({ x: 1071, y: 400, width: 100, height: 100 }, xs, ys, 8)
    expect(past.x).toBe(1071)
    expect(past.guides).toEqual({ v: [], h: [] })
  })

  it('takes the closest of the left edge, center and right edge', () => {
    // Left 534 is 6 from 540, center 1075.5 is 4.5 from 1080, right 1617 is 3 from 1620.
    const r = snapBox({ x: 534, y: 400, width: 1083, height: 100 }, xs, ys, 8)
    expect(r.x).toBe(537)
    expect(r.guides.v).toEqual([1620])
  })

  it('snaps each axis on its own', () => {
    const r = snapBox({ x: 1083, y: 670, width: 100, height: 10 }, xs, ys, 8)
    expect(r.x).toBe(1080)
    // The center (675) lands on the middle line.
    expect(r.y).toBe(670)
    expect(r.guides).toEqual({ v: [1080], h: [675] })
  })

  it('reports every guide the snapped box lines up with', () => {
    // A slide-wide box snapped to slide 1's left edge also lines up with its center and right edge.
    const r = snapBox({ x: 1084, y: 400, width: 1080, height: 100 }, xs, ys, 8)
    expect(r.x).toBe(1080)
    expect(r.guides.v).toEqual([1080, 1620, 2160])
  })
})
