import JSZip from 'jszip'
import type { Layer, ProjectTile } from '../types'
import { sliceCompositeToGrid } from './exportTiles'
import { rasterWorldLayersToTileCanvas } from './rasterWorldTile'

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
}

/** Unique label per tile index (e.g. tile-01-summer). */
function tileExportBasename(label: string, index: number): string {
  const num = String(index + 1).padStart(2, '0')
  const s = slugify(label)
  return s ? `tile-${num}-${s}` : `tile-${num}`
}

async function slicesForTile(
  tile: ProjectTile,
  indexInProject: number,
  tiles: ProjectTile[],
  layers: Layer[],
): Promise<{ blob: Blob; filename: string }[]> {
  const composite = rasterWorldLayersToTileCanvas(tiles, indexInProject, layers)
  if (!composite) return []
  return sliceCompositeToGrid(
    composite,
    tile.frameW,
    tile.frameH,
    tile.sliceW,
    tile.sliceH,
  )
}

/**
 * Download each slice for one tile as its own PNG (`tile-01-name_stitch_r1_c1.png`, …).
 */
export async function downloadTileSlicesAsSeparatePngs(
  tile: ProjectTile,
  indexInProject: number,
  tiles: ProjectTile[],
  layers: Layer[],
  downloadBlob: (blob: Blob, filename: string) => void,
  delayMs = 110,
): Promise<void> {
  const base = tileExportBasename(tile.label, indexInProject)
  const slices = await slicesForTile(tile, indexInProject, tiles, layers)
  for (const { blob, filename } of slices) {
    downloadBlob(blob, `${base}_${filename}`)
    await new Promise((r) => setTimeout(r, delayMs))
  }
}

/**
 * One ZIP for the whole row: all slice PNGs at the archive root, names prefixed per tile
 * (e.g. `tile-01-summer_stitch_r1_c1.png`).
 */
export async function buildAllTilesExportZip(
  tiles: ProjectTile[],
  layers: Layer[],
): Promise<{ blob: Blob; filename: string } | null> {
  const zip = new JSZip()
  let added = 0

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]!
    const slices = await slicesForTile(tile, i, tiles, layers)
    if (!slices.length) continue

    const base = tileExportBasename(tile.label, i)
    for (const { blob, filename } of slices) {
      zip.file(`${base}_${filename}`, blob)
      added += 1
    }
  }

  if (added === 0) return null

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  return { blob, filename: 'stitcher-export.zip' }
}
