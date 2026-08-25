import type { Layer, ProjectTile } from '../types'
import { tileOriginX } from './tile-layout'

/**
 * Rasterize world-space layers into one tile's export canvas (only the region that tile owns).
 */
export function rasterWorldLayersToTileCanvas(
  tiles: ProjectTile[],
  tileIndex: number,
  layers: Layer[],
): HTMLCanvasElement | null {
  const tile = tiles[tileIndex]
  if (!tile) return null

  const ox = tileOriginX(tiles, tileIndex)
  const fw = Math.max(1, Math.floor(tile.frameW))
  const fh = Math.max(1, Math.floor(tile.frameH))
  const tileL = ox
  const tileT = 0
  const tileR = ox + fw
  const tileB = fh

  const canvas = document.createElement('canvas')
  canvas.width = fw
  canvas.height = fh
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, fw, fh)

  for (const layer of layers) {
    if (!layer.image) continue
    const lx = layer.x
    const ly = layer.y
    const lw = layer.width
    const lh = layer.height
    const lr = lx + lw
    const lb = ly + lh

    const ix0 = Math.max(lx, tileL)
    const iy0 = Math.max(ly, tileT)
    const ix1 = Math.min(lr, tileR)
    const iy1 = Math.min(lb, tileB)
    if (ix1 <= ix0 || iy1 <= iy0) continue

    const iw = ix1 - ix0
    const ih = iy1 - iy0
    const destX = ix0 - ox
    const destY = iy0 - tileT

    const img = layer.image
    const nw = img.naturalWidth || img.width
    const nh = img.naturalHeight || img.height

    const u0 = (ix0 - lx) / lw
    const u1 = (ix1 - lx) / lw
    const v0 = (iy0 - ly) / lh
    const v1 = (iy1 - ly) / lh

    let sx = u0 * nw
    let sy = v0 * nh
    let sw = (u1 - u0) * nw
    let sh = (v1 - v0) * nh

    sx = Math.max(0, Math.min(nw, sx))
    sy = Math.max(0, Math.min(nh, sy))
    sw = Math.max(0, Math.min(nw - sx, sw))
    sh = Math.max(0, Math.min(nh - sy, sh))
    if (sw <= 0 || sh <= 0) continue

    ctx.drawImage(img, sx, sy, sw, sh, destX, destY, iw, ih)
  }

  return canvas
}

export function tileIdAtWorldCenter(
  tiles: ProjectTile[],
  cx: number,
  cy: number,
): string | null {
  let ox = 0
  for (const t of tiles) {
    if (cx >= ox && cx < ox + t.frameW && cy >= 0 && cy < t.frameH) return t.id
    ox += t.frameW
  }
  return tiles[0]?.id ?? null
}

export function tileIdForLayer(layer: Layer, tiles: ProjectTile[]): string | null {
  const cx = layer.x + layer.width / 2
  const cy = layer.y + layer.height / 2
  return tileIdAtWorldCenter(tiles, cx, cy)
}
