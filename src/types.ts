export type Layer = {
  id: string
  name: string
  url: string
  image: HTMLImageElement | null
  x: number
  y: number
  width: number
  height: number
  /** When true, transforms keep the layer's width/height ratio. */
  lockAspect: boolean
}

/** One composition (frame + slice grid). Layers live in world space and can span tiles. */
export type ProjectTile = {
  id: string
  label: string
  frameW: number
  frameH: number
  sliceW: number
  sliceH: number
}
