import type { ProjectTile } from '../types'

/** Left edge of tile `index` in world pixels (tiles flush, no gap). */
export function tileOriginX(tiles: ProjectTile[], index: number): number {
  let x = 0
  for (let i = 0; i < index && i < tiles.length; i++) {
    x += tiles[i].frameW
  }
  return x
}

export function totalTilesWidth(tiles: ProjectTile[]): number {
  return tiles.reduce((s, t) => s + t.frameW, 0)
}
