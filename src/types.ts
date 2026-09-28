/**
 * How a layer relates to the carousel. `fill` and `fit` layers rescale with the whole row when
 * the slide count or format changes; `free` layers keep their size and position.
 */
export type FitMode = 'fill' | 'fit' | 'free'

export type Layer = {
  id: string
  name: string
  url: string
  image: HTMLImageElement | null
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
