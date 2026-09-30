import type { CarouselDoc, FitMode, Layer } from '../types'

export const MAX_SLIDES = 20
export const QUICK_COUNTS = [2, 3, 4, 5, 6, 8, 10]

export type Box = { x: number; y: number; width: number; height: number }

export type LoadedImage = { id: string; name: string; naturalWidth: number; naturalHeight: number }

export function createDoc(): CarouselDoc {
  return {
    slideW: 1080,
    slideH: 1350,
    count: 3,
    gridCols: 1,
    gridRows: 1,
    background: '#ffffff',
    layers: [],
  }
}

export function totalWidth(doc: CarouselDoc): number {
  return doc.slideW * doc.count
}

export function slideIndexAt(doc: CarouselDoc, x: number): number {
  return Math.max(0, Math.min(doc.count - 1, Math.floor(x / doc.slideW)))
}

export function normalizeDegrees(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180
}

function naturalSize(layer: Pick<Layer, 'naturalWidth' | 'naturalHeight'>): { w: number; h: number } {
  return { w: Math.max(1, layer.naturalWidth || 1), h: Math.max(1, layer.naturalHeight || 1) }
}

function scaledBox(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
  mode: 'cover' | 'contain',
): Box {
  const s =
    mode === 'cover' ? Math.max(boxW / srcW, boxH / srcH) : Math.min(boxW / srcW, boxH / srcH)
  const width = srcW * s
  const height = srcH * s
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height }
}

function center(b: Box): { cx: number; cy: number } {
  return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 }
}

/**
 * Where a layer sits at 100% zoom: covering the whole row (fill), contained in it (fit), or
 * contained in the slide under its center with a small inset (free).
 */
export function baseBox(
  doc: CarouselDoc,
  layer: Pick<Layer, 'naturalWidth' | 'naturalHeight' | 'fit' | 'x' | 'width'>,
): Box {
  const { w, h } = naturalSize(layer)
  if (layer.fit === 'fill') return scaledBox(w, h, totalWidth(doc), doc.slideH, 'cover')
  if (layer.fit === 'fit') return scaledBox(w, h, totalWidth(doc), doc.slideH, 'contain')
  const i = slideIndexAt(doc, layer.x + layer.width / 2)
  const inset = 0.04
  const b = scaledBox(w, h, doc.slideW * (1 - 2 * inset), doc.slideH * (1 - 2 * inset), 'contain')
  return { ...b, x: b.x + i * doc.slideW + doc.slideW * inset, y: b.y + doc.slideH * inset }
}

export function layerZoom(doc: CarouselDoc, layer: Layer): number {
  return layer.width / Math.max(1e-6, baseBox(doc, layer).width)
}

/** Scale around the layer's center so its width is `zoom` × its base width. */
export function zoomLayer(doc: CarouselDoc, layer: Layer, zoom: number): Layer {
  const base = baseBox(doc, layer)
  const ratio = layer.height / Math.max(1e-6, layer.width)
  const width = base.width * zoom
  const height = width * ratio
  const { cx, cy } = center(layer)
  return { ...layer, width, height, x: cx - width / 2, y: cy - height / 2 }
}

export function resetToFit(doc: CarouselDoc, layer: Layer, fit: FitMode): Layer {
  const next = { ...layer, fit }
  return { ...next, ...baseBox(doc, next) }
}

export function makeLayer(
  doc: CarouselDoc,
  img: LoadedImage,
  fit: FitMode,
  slideIndex = 0,
): Layer {
  const draft: Layer = {
    id: crypto.randomUUID(),
    name: img.name,
    imageId: img.id,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    x: slideIndex * doc.slideW,
    y: 0,
    width: doc.slideW,
    height: doc.slideH,
    rotation: 0,
    flipX: false,
    fit,
    lockAspect: true,
  }
  return resetToFit(doc, draft, fit)
}

/** Swap a layer's image, keeping its center and zoom. */
export function replaceLayerImage(doc: CarouselDoc, layer: Layer, img: LoadedImage): Layer {
  const zoom = layerZoom(doc, layer)
  const next = {
    ...layer,
    name: img.name,
    imageId: img.id,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
  }
  const base = baseBox(doc, next)
  const width = base.width * zoom
  const height = base.height * zoom
  const { cx, cy } = center(layer)
  return { ...next, width, height, x: cx - width / 2, y: cy - height / 2 }
}

/**
 * Carry layers from `prev` into `next` after the slide count or size changes. Fill/fit layers
 * keep their zoom and offset relative to the row; free layers scale with the slide size, and
 * any that end up entirely past the last slide are dropped.
 */
export function relayout(prev: CarouselDoc, next: CarouselDoc): CarouselDoc {
  const sx = next.slideW / prev.slideW
  const sy = next.slideH / prev.slideH
  const sizeChanged = sx !== 1 || sy !== 1
  const width = totalWidth(next)

  const layers = next.layers.flatMap((l) => {
    if (l.fit !== 'free') {
      const oldBase = baseBox(prev, l)
      const newBase = baseBox(next, l)
      const k = newBase.width / Math.max(1e-6, oldBase.width)
      const o = center(l)
      const ob = center(oldBase)
      const nb = center(newBase)
      const w = l.width * k
      const h = l.height * k
      const cx = nb.cx + (o.cx - ob.cx) * k
      const cy = nb.cy + (o.cy - ob.cy) * k
      return [{ ...l, width: w, height: h, x: cx - w / 2, y: cy - h / 2 }]
    }
    let moved = l
    if (sizeChanged) {
      const s = Math.min(sx, sy)
      const o = center(l)
      const w = l.width * s
      const h = l.height * s
      moved = { ...l, width: w, height: h, x: o.cx * sx - w / 2, y: o.cy * sy - h / 2 }
    }
    return moved.x >= width ? [] : [moved]
  })

  return { ...next, layers }
}

export function setSlideCount(doc: CarouselDoc, count: number): CarouselDoc {
  const n = Math.max(1, Math.min(MAX_SLIDES, Math.round(count)))
  return n === doc.count ? doc : relayout(doc, { ...doc, count: n })
}

/** Remove one slide; free layers on it go with it and layers to its right shift left. */
export function removeSlide(doc: CarouselDoc, index: number): CarouselDoc {
  if (doc.count <= 1) return doc
  const left = index * doc.slideW
  const right = left + doc.slideW
  const layers = doc.layers.flatMap((l) => {
    if (l.fit !== 'free') return [l]
    const cx = l.x + l.width / 2
    if (cx >= left && cx < right) return []
    return [cx >= right ? { ...l, x: l.x - doc.slideW } : l]
  })
  const prev = { ...doc, layers }
  return relayout(prev, { ...prev, count: doc.count - 1 })
}

export function moveLayer(doc: CarouselDoc, id: string, dir: -1 | 1): CarouselDoc {
  const i = doc.layers.findIndex((l) => l.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= doc.layers.length) return doc
  const layers = [...doc.layers]
  const [item] = layers.splice(i, 1)
  layers.splice(j, 0, item!)
  return { ...doc, layers }
}
