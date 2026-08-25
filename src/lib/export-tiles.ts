import type { Layer } from '../types'

export function gridCounts(
  frameW: number,
  frameH: number,
  sliceW: number,
  sliceH: number,
): { cols: number; rows: number } {
  const sw = Math.max(1, sliceW)
  const sh = Math.max(1, sliceH)
  return {
    cols: Math.max(1, Math.ceil(frameW / sw)),
    rows: Math.max(1, Math.ceil(frameH / sh)),
  }
}

export type ExportTilesOptions = {
  /** Prepended to each filename so multiple compositions stay distinct (e.g. `carousel-a_`). */
  filenamePrefix?: string
}

/** Cut a filled composite canvas into sliceW×sliceH cells (white padding on partial cells). */
export async function sliceCompositeToGrid(
  composite: HTMLCanvasElement,
  frameW: number,
  frameH: number,
  sliceW: number,
  sliceH: number,
  options?: ExportTilesOptions,
): Promise<{ blob: Blob; filename: string }[]> {
  const prefix = options?.filenamePrefix ?? ''
  const fw = Math.max(1, Math.floor(frameW))
  const fh = Math.max(1, Math.floor(frameH))
  const sw = Math.max(1, Math.floor(sliceW))
  const sh = Math.max(1, Math.floor(sliceH))
  const { cols, rows } = gridCounts(fw, fh, sw, sh)

  const results: { blob: Blob; filename: string }[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = col * sw
      const sy = row * sh
      const w = Math.min(sw, fw - sx)
      const h = Math.min(sh, fh - sy)
      if (w <= 0 || h <= 0) continue

      const cell = document.createElement('canvas')
      cell.width = sw
      cell.height = sh
      const tctx = cell.getContext('2d')
      if (!tctx) continue
      tctx.fillStyle = '#ffffff'
      tctx.fillRect(0, 0, sw, sh)
      tctx.drawImage(composite, sx, sy, w, h, 0, 0, w, h)

      const blob = await new Promise<Blob | null>((resolve) =>
        cell.toBlob((b) => resolve(b), 'image/png'),
      )
      if (!blob) continue
      results.push({
        blob,
        filename: `${prefix}stitch_r${row + 1}_c${col + 1}.png`,
      })
    }
  }

  return results
}

/** Composite layers into the frame, then cut a grid of cells (each cell is sliceW×sliceH, bottom/right padded with white if needed). */
export async function exportTiles(
  frameW: number,
  frameH: number,
  sliceW: number,
  sliceH: number,
  layers: Layer[],
  options?: ExportTilesOptions,
): Promise<{ blob: Blob; filename: string }[]> {
  const fw = Math.max(1, Math.floor(frameW))
  const fh = Math.max(1, Math.floor(frameH))

  const composite = document.createElement('canvas')
  composite.width = fw
  composite.height = fh
  const ctx = composite.getContext('2d')
  if (!ctx) return []

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, fw, fh)

  for (const layer of layers) {
    if (!layer.image) continue
    ctx.drawImage(layer.image, layer.x, layer.y, layer.width, layer.height)
  }

  return sliceCompositeToGrid(composite, frameW, frameH, sliceW, sliceH, options)
}
