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
  /** A solid edge around the image's opaque pixels (the sticker look). */
  outline?: LayerOutline
  /** A soft shadow that follows the image's transparency, and its outline when there is one. */
  shadow?: LayerShadow
  /** Gaussian blur radius in world pixels, e.g. the background of a portrait. */
  blur?: number
  /** Color adjustments and a film look. All amounts, not sizes, so they don't scale with the format. */
  look?: LayerLook
  /** The date in the photo's corner, the way a point-and-shoot printed it. */
  dateStamp?: LayerDateStamp
  /** Left out of the canvas and the export, but kept in the doc. */
  hidden?: boolean
  /** Can't be grabbed on the canvas, so whatever is under it can be; still picked from the layer list. */
  locked?: boolean
}

/** `ymd` is '98 10 12, `mdy` is 10 12 '98 and `dmy` is 12.10.98. */
export type DateStampFormat = 'ymd' | 'mdy' | 'dmy'

/** `date` is YYYY-MM-DD, read from the photo's EXIF when it has one, so the doc stays plain data. */
export type LayerDateStamp = { date: string; format: DateStampFormat }

/** The presets in `lib/film-looks`. */
export type FilmLookId = 'golden' | 'instant' | 'disposable' | 'slide' | 'matte' | 'retro' | 'cinema' | 'mono'

/**
 * A layer's color: a film preset at `strength` (0 to 1), then the adjustments, each -1 to 1, with
 * grain and vignette 0 to 1. All at 0 with no preset leaves the photo as it is.
 */
export type LayerLook = {
  film: FilmLookId | null
  strength: number
  brightness: number
  contrast: number
  saturation: number
  warmth: number
  grain: number
  vignette: number
}

/** Sizes are world pixels, like the layer's box, so they look the same at any zoom and in export. */
export type LayerOutline = { color: string; width: number }

export type LayerShadow = { color: string; blur: number; offsetX: number; offsetY: number; opacity: number }

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
  /** Light leaking across the seams, over every layer. Optional so older autosaves still load. */
  lightLeaks?: LightLeaks
}

/** `amount` 0 to 1 (0 is off); `seed` places the leaks, and Shuffle picks a new one. */
export type LightLeaks = { amount: number; color: string; seed: number }
