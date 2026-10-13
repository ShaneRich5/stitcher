import { describe, expect, it } from 'vitest'
import {
  baseBox,
  createDoc,
  layerZoom,
  makeLayer,
  moveLayer,
  moveLayerTo,
  normalizeDegrees,
  profileGridCrop,
  relayout,
  removeSlide,
  replaceLayerImage,
  setSlideCount,
  zoomLayer,
  type LoadedImage,
} from './carousel'
import type { CarouselDoc, Layer } from '../types'

// The default doc: three 1080 × 1350 slides, so the row is 3240 wide.
const doc = createDoc()
const wide: LoadedImage = { id: 'wide', name: 'wide.jpg', naturalWidth: 2000, naturalHeight: 1000 }
const square: LoadedImage = { id: 'square', name: 'square.jpg', naturalWidth: 1000, naturalHeight: 1000 }

function withLayers(d: CarouselDoc, ...layers: Layer[]): CarouselDoc {
  return { ...d, layers }
}

function center(l: { x: number; y: number; width: number; height: number }) {
  return { cx: l.x + l.width / 2, cy: l.y + l.height / 2 }
}

describe('baseBox', () => {
  it('fill covers the whole row, centred', () => {
    // cover: max(3240 / 2000, 1350 / 1000) = 1.62
    const box = baseBox(doc, { ...wide, fit: 'fill', x: 0, width: 0 })
    expect(box.width).toBeCloseTo(3240)
    expect(box.height).toBeCloseTo(1620)
    expect(box.x).toBeCloseTo(0)
    expect(box.y).toBeCloseTo(-135)
  })

  it('fit is contained in the row, centred', () => {
    // contain: min(1.62, 1.35) = 1.35
    const box = baseBox(doc, { ...wide, fit: 'fit', x: 0, width: 0 })
    expect(box.width).toBeCloseTo(2700)
    expect(box.height).toBeCloseTo(1350)
    expect(box.x).toBeCloseTo(270)
    expect(box.y).toBeCloseTo(0)
  })

  it('free is contained in the slide under its center, inset by 4%', () => {
    // Center at x = 1130 is on slide 1. The inset box is 993.6 × 1242.
    const box = baseBox(doc, { ...square, fit: 'free', x: 1080, width: 100 })
    expect(box.width).toBeCloseTo(993.6)
    expect(box.height).toBeCloseTo(993.6)
    expect(box.x).toBeCloseTo(1080 + 43.2)
    expect(box.y).toBeCloseTo(54 + (1242 - 993.6) / 2)
  })

  it('treats a missing natural size as 1 × 1 instead of dividing by zero', () => {
    const box = baseBox(doc, { naturalWidth: 0, naturalHeight: 0, fit: 'fill', x: 0, width: 0 })
    expect(Number.isFinite(box.width)).toBe(true)
    expect(box.width).toBeCloseTo(3240)
  })
})

describe('zoomLayer', () => {
  it('scales around the center and keeps the ratio', () => {
    const layer = makeLayer(doc, wide, 'fill')
    const zoomed = zoomLayer(doc, layer, 2)
    expect(zoomed.width).toBeCloseTo(6480)
    expect(zoomed.height).toBeCloseTo(3240)
    expect(center(zoomed).cx).toBeCloseTo(center(layer).cx)
    expect(center(zoomed).cy).toBeCloseTo(center(layer).cy)
    expect(layerZoom(doc, zoomed)).toBeCloseTo(2)
  })

  it('keeps a stretched layer stretched', () => {
    const layer = { ...makeLayer(doc, square, 'free'), height: 500 }
    const zoomed = zoomLayer(doc, layer, 1.5)
    expect(zoomed.height / zoomed.width).toBeCloseTo(layer.height / layer.width)
  })
})

describe('replaceLayerImage', () => {
  it('keeps the center and zoom, and takes the new image', () => {
    const layer = zoomLayer(doc, makeLayer(doc, wide, 'fill'), 1.25)
    const next = replaceLayerImage(doc, layer, square)
    expect(next.imageId).toBe('square')
    expect(next.name).toBe('square.jpg')
    expect(next.naturalWidth).toBe(1000)
    expect(layerZoom(doc, next)).toBeCloseTo(1.25)
    expect(center(next).cx).toBeCloseTo(center(layer).cx)
    expect(center(next).cy).toBeCloseTo(center(layer).cy)
    // A square image keeps a square box.
    expect(next.width).toBeCloseTo(next.height)
  })
})

describe('relayout', () => {
  it('refits a fill layer to the longer row when slides are added', () => {
    const prev = withLayers(doc, makeLayer(doc, wide, 'fill'))
    const next = relayout(prev, { ...prev, count: 4 })
    const base = baseBox(next, next.layers[0]!)
    expect(next.layers[0]!.width).toBeCloseTo(base.width)
    expect(next.layers[0]!.width).toBeCloseTo(4320)
    expect(next.layers[0]!.x).toBeCloseTo(base.x)
  })

  it('keeps a fill layer zoom and offset relative to the row', () => {
    const layer = zoomLayer(doc, makeLayer(doc, wide, 'fill'), 1.5)
    const moved = { ...layer, x: layer.x + 100 }
    const prev = withLayers(doc, moved)
    const next = relayout(prev, { ...prev, count: 6 })
    expect(layerZoom(next, next.layers[0]!)).toBeCloseTo(1.5)
    // Row width doubled (and the cover scale with it), so the offset from the base doubles too.
    const offset = center(next.layers[0]!).cx - center(baseBox(next, next.layers[0]!)).cx
    expect(offset).toBeCloseTo(200)
  })

  it('scales free layers with the slide size when the format changes', () => {
    const free = { ...makeLayer(doc, square, 'free', 1), x: 1200, y: 300, width: 400, height: 400 }
    const prev = withLayers(doc, free)
    // 4:5 → 1:1: sx = 1, sy = 0.8, so sizes scale by 0.8 and the center by each axis.
    const next = relayout(prev, { ...prev, slideW: 1080, slideH: 1080 })
    const l = next.layers[0]!
    expect(l.width).toBeCloseTo(320)
    expect(l.height).toBeCloseTo(320)
    expect(center(l).cx).toBeCloseTo(1400)
    expect(center(l).cy).toBeCloseTo(400)
  })

  it('scales effect sizes when the format changes', () => {
    const layer: Layer = {
      ...makeLayer(doc, square, 'free'),
      outline: { color: '#fff', width: 10 },
      shadow: { color: '#000', blur: 20, offsetX: 5, offsetY: 10, opacity: 0.5 },
      blur: 8,
    }
    const prev = withLayers(doc, layer)
    const next = relayout(prev, { ...prev, slideW: 540, slideH: 675 })
    const l = next.layers[0]!
    expect(l.outline!.width).toBeCloseTo(5)
    expect(l.shadow!.blur).toBeCloseTo(10)
    expect(l.shadow!.offsetY).toBeCloseTo(5)
    expect(l.blur).toBeCloseTo(4)
  })

  it('drops free layers left past the last slide, and keeps the others', () => {
    const first = makeLayer(doc, square, 'free', 0)
    const last = makeLayer(doc, square, 'free', 2)
    const prev = withLayers(doc, first, last)
    const next = relayout(prev, { ...prev, count: 2 })
    expect(next.layers.map((l) => l.id)).toEqual([first.id])
  })
})

describe('setSlideCount', () => {
  it('clamps to 1–20 and rounds', () => {
    expect(setSlideCount(doc, 0).count).toBe(1)
    expect(setSlideCount(doc, -3).count).toBe(1)
    expect(setSlideCount(doc, 25).count).toBe(20)
    expect(setSlideCount(doc, 4.6).count).toBe(5)
  })

  it('returns the same doc when nothing changes', () => {
    expect(setSlideCount(doc, 3)).toBe(doc)
    expect(setSlideCount(doc, 3.2)).toBe(doc)
  })
})

describe('removeSlide', () => {
  it('removes free layers on the slide and shifts those to its right', () => {
    const onFirst = makeLayer(doc, square, 'free', 0)
    const onMiddle = makeLayer(doc, square, 'free', 1)
    const onLast = makeLayer(doc, square, 'free', 2)
    const fill = makeLayer(doc, wide, 'fill')
    const next = removeSlide(withLayers(doc, fill, onFirst, onMiddle, onLast), 1)

    expect(next.count).toBe(2)
    expect(next.layers.map((l) => l.id)).toEqual([fill.id, onFirst.id, onLast.id])
    expect(next.layers[1]!.x).toBeCloseTo(onFirst.x)
    expect(next.layers[2]!.x).toBeCloseTo(onLast.x - 1080)
    // The fill layer is refit to the shorter row.
    expect(next.layers[0]!.width).toBeCloseTo(baseBox(next, next.layers[0]!).width)
  })

  it('never removes the only slide', () => {
    const one = { ...doc, count: 1 }
    expect(removeSlide(one, 0)).toBe(one)
  })
})

describe('moveLayer', () => {
  const a = makeLayer(doc, square, 'free', 0)
  const b = makeLayer(doc, square, 'free', 1)
  const c = makeLayer(doc, square, 'free', 2)
  const stacked = withLayers(doc, a, b, c)

  it('moves a layer one step up or down the stack', () => {
    expect(moveLayer(stacked, a.id, 1).layers.map((l) => l.id)).toEqual([b.id, a.id, c.id])
    expect(moveLayer(stacked, c.id, -1).layers.map((l) => l.id)).toEqual([a.id, c.id, b.id])
  })

  it('leaves the doc alone at either end, or for an unknown id', () => {
    expect(moveLayer(stacked, c.id, 1)).toBe(stacked)
    expect(moveLayer(stacked, a.id, -1)).toBe(stacked)
    expect(moveLayer(stacked, 'nope', 1)).toBe(stacked)
  })
})

describe('moveLayerTo', () => {
  const a = makeLayer(doc, square, 'free', 0)
  const b = makeLayer(doc, square, 'free', 1)
  const c = makeLayer(doc, square, 'free', 2)
  const stacked = withLayers(doc, a, b, c)
  const ids = (d: CarouselDoc) => d.layers.map((l) => l.id)

  it('moves a layer to any place in the stack', () => {
    expect(ids(moveLayerTo(stacked, a.id, 2))).toEqual([b.id, c.id, a.id])
    expect(ids(moveLayerTo(stacked, c.id, 0))).toEqual([c.id, a.id, b.id])
    expect(ids(moveLayerTo(stacked, a.id, 1))).toEqual([b.id, a.id, c.id])
  })

  it('clamps the place to the stack', () => {
    expect(ids(moveLayerTo(stacked, a.id, 9))).toEqual([b.id, c.id, a.id])
    expect(ids(moveLayerTo(stacked, c.id, -3))).toEqual([c.id, a.id, b.id])
  })

  it('leaves the doc alone when nothing moves, or for an unknown id', () => {
    expect(moveLayerTo(stacked, b.id, 1)).toBe(stacked)
    expect(moveLayerTo(stacked, 'nope', 0)).toBe(stacked)
  })
})

describe('normalizeDegrees', () => {
  it('wraps into [-180, 180)', () => {
    expect(normalizeDegrees(0)).toBe(0)
    expect(normalizeDegrees(45)).toBe(45)
    expect(normalizeDegrees(190)).toBe(-170)
    expect(normalizeDegrees(-190)).toBe(170)
    expect(normalizeDegrees(180)).toBe(-180)
    expect(normalizeDegrees(360)).toBe(0)
    expect(normalizeDegrees(-720 + 30)).toBe(30)
  })
})

describe('profileGridCrop', () => {
  it('trims the sides of wider slides', () => {
    // 4:5 loses about 34 px a side, 1:1 135 px.
    const portrait = profileGridCrop({ slideW: 1080, slideH: 1350 })!
    expect(portrait.x).toBeCloseTo(33.75)
    expect(portrait.width).toBeCloseTo(1012.5)
    expect(portrait.height).toBe(1350)
    expect(profileGridCrop({ slideW: 1080, slideH: 1080 })!.x).toBeCloseTo(135)
  })

  it('trims the top and bottom of taller slides', () => {
    const story = profileGridCrop({ slideW: 1080, slideH: 1920 })!
    expect(story.x).toBe(0)
    expect(story.height).toBeCloseTo(1440)
    expect(story.y).toBeCloseTo(240)
  })

  it('is null for 3:4', () => {
    expect(profileGridCrop({ slideW: 1080, slideH: 1440 })).toBeNull()
  })
})
