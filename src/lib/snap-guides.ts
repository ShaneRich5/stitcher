import type { CarouselDoc } from '../types'

export type SnapGuides = {
  v: number[]
  h: number[]
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((v) => Math.round(v)))].sort((a, b) => a - b)
}

/** Slide edges, slide centers and grid-cut lines, in world pixels. */
export function collectSnapTargets(doc: CarouselDoc): { xs: number[]; ys: number[] } {
  const xs: number[] = []
  const ys: number[] = [0, doc.slideH / 2, doc.slideH]

  for (let i = 0; i <= doc.count; i++) xs.push(i * doc.slideW)
  for (let i = 0; i < doc.count; i++) {
    const ox = i * doc.slideW
    xs.push(ox + doc.slideW / 2)
    for (let c = 1; c < doc.gridCols; c++) xs.push(ox + (c * doc.slideW) / doc.gridCols)
  }
  for (let r = 1; r < doc.gridRows; r++) ys.push((r * doc.slideH) / doc.gridRows)

  return { xs: uniqueSorted(xs), ys: uniqueSorted(ys) }
}

function snapDelta(value: number, targets: number[], threshold: number): number | null {
  let best: number | null = null
  let bestAbs = threshold
  for (const t of targets) {
    const d = t - value
    const a = Math.abs(d)
    if (a <= bestAbs) {
      bestAbs = a
      best = d
    }
  }
  return best
}

/** Snap a box's edges/center to guide lines. Returns new origin + active guides. */
export function snapBox(
  box: { x: number; y: number; width: number; height: number },
  xs: number[],
  ys: number[],
  threshold: number,
): { x: number; y: number; guides: SnapGuides } {
  const xCandidates = [box.x, box.x + box.width / 2, box.x + box.width]
  const yCandidates = [box.y, box.y + box.height / 2, box.y + box.height]

  let dx = 0
  let dy = 0
  let bestX = threshold + 1
  let bestY = threshold + 1

  for (const v of xCandidates) {
    const d = snapDelta(v, xs, threshold)
    if (d !== null && Math.abs(d) < bestX) {
      bestX = Math.abs(d)
      dx = d
    }
  }
  for (const v of yCandidates) {
    const d = snapDelta(v, ys, threshold)
    if (d !== null && Math.abs(d) < bestY) {
      bestY = Math.abs(d)
      dy = d
    }
  }

  const x = box.x + (bestX <= threshold ? dx : 0)
  const y = box.y + (bestY <= threshold ? dy : 0)
  const guides: SnapGuides = { v: [], h: [] }

  if (bestX <= threshold) {
    for (const v of [x, x + box.width / 2, x + box.width]) {
      for (const t of xs) {
        if (Math.abs(v - t) <= 0.75) guides.v.push(t)
      }
    }
  }
  if (bestY <= threshold) {
    for (const v of [y, y + box.height / 2, y + box.height]) {
      for (const t of ys) {
        if (Math.abs(v - t) <= 0.75) guides.h.push(t)
      }
    }
  }

  return {
    x,
    y,
    guides: { v: uniqueSorted(guides.v), h: uniqueSorted(guides.h) },
  }
}
