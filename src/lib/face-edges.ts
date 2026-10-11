import { imageBoxToWorld, layerBounds, totalWidth, type Box } from './carousel'
import type { CarouselDoc, Layer } from '../types'

/**
 * Faces split by a slide edge. A seamless carousel spans slides on purpose, but a face cut down
 * the middle looks broken when the post is seen one slide at a time. Faces are found once per
 * image (`detect-faces.ts`) in its own pixels; everything here maps them through the layer, so
 * moving a layer only re-maps them.
 */

/** Faces found in each image, in that image's pixels, keyed by `imageId`. */
export type FaceMap = Record<string, Box[]>

export type FaceMark = { layerId: string; box: Box }

/** An edge splits a face when it cuts more than this fraction of the face's width off both sides. */
const EDGE_TOLERANCE = 0.12
/** A nudge leaves this fraction of a face's width between the face and the edge it clears. */
const NUDGE_MARGIN = 0.04
/** Faces narrower than this fraction of a slide are too small for a split to show. */
const MIN_FACE = 0.02
/** A nudge moves a face at most this fraction of a slide; past that it's rearranging the photo. */
const MAX_NUDGE = 0.5

/** A layer's faces as world-space boxes. */
export function layerFaces(layer: Layer, faces: FaceMap): Box[] {
  return (faces[layer.imageId] ?? []).map((f) => imageBoxToWorld(layer, f))
}

/** True when a slide edge (x = k × slideW, between two slides) runs through the face. */
function onEdge(doc: CarouselDoc, face: Box): boolean {
  if (face.width < doc.slideW * MIN_FACE) return false
  if (face.y + face.height <= 0 || face.y >= doc.slideH) return false
  const inset = face.width * EDGE_TOLERANCE
  const lo = face.x + inset
  const hi = face.x + face.width - inset
  const k = Math.max(1, Math.floor(lo / doc.slideW) + 1)
  return k <= doc.count - 1 && k * doc.slideW < hi
}

/** Every face a slide edge splits, in every layer. */
export function facesOnEdges(doc: CarouselDoc, faces: FaceMap): FaceMark[] {
  if (doc.count < 2) return []
  return doc.layers.flatMap((layer) =>
    layerFaces(layer, faces)
      .filter((box) => onEdge(doc, box))
      .map((box) => ({ layerId: layer.id, box })),
  )
}

/** The layer moved along x by x' = a + s·x, and scaled by s around its own center vertically. */
function transformLayer(layer: Layer, a: number, s: number): Layer {
  const cx = a + s * (layer.x + layer.width / 2)
  const cy = layer.y + layer.height / 2
  const width = layer.width * s
  const height = layer.height * s
  return { ...layer, width, height, x: cx - width / 2, y: cy - height / 2 }
}

/**
 * The smallest move that takes the layer's faces off the slide edges, as the moved layer, or
 * null when no move clears more of them than now. Each face side landing just past each edge is
 * a candidate. A layer that covered an end of the row keeps covering it: rather than open a gap
 * there, the move anchors that end and zooms in just enough.
 */
export function nudgeOffEdges(doc: CarouselDoc, layer: Layer, faces: FaceMap): Layer | null {
  const faceBoxes = layerFaces(layer, faces)
  const split = (l: Layer) => layerFaces(l, faces).filter((b) => onEdge(doc, b)).length
  const before = faceBoxes.filter((b) => onEdge(doc, b)).length
  if (!before) return null

  const rowEnd = totalWidth(doc)
  const bounds = layerBounds(layer)
  const left = bounds.x
  const right = bounds.x + bounds.width
  const coversStart = left <= 0
  const coversEnd = right >= rowEnd

  let best: { layer: Layer; split: number; cost: number } | null = null
  for (const face of faceBoxes) {
    const margin = face.width * NUDGE_MARGIN
    for (let k = 1; k < doc.count; k++) {
      const edge = k * doc.slideW
      // Move left until the face's right side clears the edge, or right until its left side does.
      for (const [from, to] of [
        [face.x + face.width, edge - margin],
        [face.x, edge + margin],
      ] as const) {
        const dx = to - from
        if (Math.abs(dx) > doc.slideW * MAX_NUDGE) continue
        let moved: Layer
        if (dx > 0 && coversStart && left + dx > 0) {
          // Pin the layer's left side to the row's start: s·(from − left) = to.
          if (from - left <= 0) continue
          const s = to / (from - left)
          moved = transformLayer(layer, -s * left, s)
        } else if (dx < 0 && coversEnd && right + dx < rowEnd) {
          // Pin the layer's right side to the row's end: rowEnd + s·(from − right) = to.
          if (right - from <= 0) continue
          const s = (rowEnd - to) / (right - from)
          moved = transformLayer(layer, rowEnd - s * right, s)
        } else {
          moved = transformLayer(layer, dx, 1)
        }
        const count = split(moved)
        const cost = Math.abs(dx)
        if (!best || count < best.split || (count === best.split && cost < best.cost)) {
          best = { layer: moved, split: count, cost }
        }
      }
    }
  }
  return best && best.split < before ? best.layer : null
}
