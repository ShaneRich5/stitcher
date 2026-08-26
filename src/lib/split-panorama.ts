import type { ProjectTile } from '../types'

/** Scale an image to cover a box (may crop / overflow the box). */
export function coverImageInBox(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; width: number; height: number } {
  const sw = Math.max(1, srcW)
  const sh = Math.max(1, srcH)
  const scale = Math.max(boxW / sw, boxH / sh)
  const width = Math.round(sw * scale)
  const height = Math.round(sh * scale)
  return {
    width,
    height,
    x: Math.round((boxW - width) / 2),
    y: Math.round((boxH - height) / 2),
  }
}

export function makeSplitTiles(
  count: number,
  frameW: number,
  frameH: number,
): ProjectTile[] {
  const n = Math.max(2, Math.min(10, Math.floor(count)))
  const fw = Math.max(1, Math.floor(frameW))
  const fh = Math.max(1, Math.floor(frameH))
  return Array.from({ length: n }, (_, i) => ({
    id: crypto.randomUUID(),
    label: `Tile ${i + 1}`,
    frameW: fw,
    frameH: fh,
    sliceW: fw,
    sliceH: fh,
  }))
}
