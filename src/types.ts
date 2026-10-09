/**
 * How a layer relates to the carousel. `fill` and `fit` layers rescale with the whole row when
 * the slide count or format changes; `free` layers keep their size and position.
 */
export type FitMode = 'fill' | 'fit' | 'free'

export type Layer = {
  id: string
  name: string
  /** Looks up the decoded image in `lib/image-registry`. Plain data, so the doc is JSON-safe. */
  imageId: string
  naturalWidth: number
  naturalHeight: number
  /** Top-left of the unrotated box, in world pixels. */
  x: number
  y: number
  width: number
  height: number
  /** Degrees clockwise around the box center. */
  rotation: number
  flipX: boolean
  fit: FitMode
  /** When true, resizing keeps the layer's width/height ratio. */
  lockAspect: boolean
}

/** One still in the GIF tool's sequence. Like `Layer`, it holds plain data only. */
export type GifFrame = {
  id: string
  name: string
  /** Looks up the decoded image in `lib/image-registry`. */
  imageId: string
  naturalWidth: number
  naturalHeight: number
  /** Overrides the doc's shared `delayMs` for this frame alone. Set from the timeline view. */
  holdMs?: number
}

/** One photo in the video collage: the photo is its background, its cutout the stacked subject. */
export type CollageItem = {
  id: string
  name: string
  /** The photo itself, looked up in `lib/image-registry`. */
  imageId: string
  naturalWidth: number
  naturalHeight: number
  /** The cutout of its subject (same size as the photo), or null until background removal finishes. */
  cutoutId: string | null
  /** Background removal failed; the strip offers a retry. */
  failed: boolean
}

/** A row of identical slides. Layers live in world space so one image can span several slides. */
export type CarouselDoc = {
  slideW: number
  slideH: number
  count: number
  /** Cut each exported slide into a cols × rows grid (1 × 1 exports whole slides). */
  gridCols: number
  gridRows: number
  /** Fill behind the layers; null exports transparent PNGs. */
  background: string | null
  layers: Layer[]
}
