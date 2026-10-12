import type { FilmLookId, LayerLook } from '../types'

/**
 * Film looks and color adjustments. A look is a preset grade plus grain and a vignette; the
 * adjustments add to it. `gradePixels` applies one to RGBA pixels and touches no DOM, so
 * `layer-effects.ts` owns the canvases and the caching.
 */

type Rgb = [number, number, number]

/** What a look boils down to. Every value is 0 for "unchanged". */
type Grade = {
  /** -1 to 1: midtones darker or brighter, black and white stay put. */
  exposure: number
  /** -1 to 1: an S-curve above 0, a flatter range below. */
  contrast: number
  /** 0 to 1: lifts the blacks and dims the whites, like a faded print. */
  fade: number
  /** -1 (black and white) to 1. */
  saturation: number
  /** -1 (blue) to 1 (amber). */
  warmth: number
  /** -1 (green) to 1 (magenta). */
  tint: number
  /** Color pushed into the dark tones and into the light ones, each channel -1 to 1. */
  shadows: Rgb
  highlights: Rgb
}

export type FilmLook = {
  id: FilmLookId
  name: string
  grade: Partial<Grade>
  /** Where the Grain and Vignette sliders start when the look is picked. */
  grain: number
  vignette: number
}

export const FILM_LOOKS: FilmLook[] = [
  {
    id: 'golden',
    name: 'Golden',
    grade: {
      exposure: 0.1,
      contrast: 0.1,
      fade: 0.15,
      saturation: -0.05,
      warmth: 0.45,
      tint: 0.05,
      shadows: [-0.1, 0, 0.15],
      highlights: [0.35, 0.15, -0.3],
    },
    grain: 0.25,
    vignette: 0.2,
  },
  {
    id: 'instant',
    name: 'Instant',
    grade: {
      exposure: 0.15,
      contrast: -0.15,
      fade: 0.4,
      saturation: -0.15,
      warmth: 0.15,
      tint: -0.1,
      shadows: [-0.35, 0.15, 0.3],
      highlights: [0.3, 0.25, -0.25],
    },
    grain: 0.3,
    vignette: 0.35,
  },
  {
    id: 'disposable',
    name: 'Disposable',
    grade: {
      contrast: 0.35,
      fade: 0.1,
      saturation: 0.2,
      warmth: 0.15,
      tint: -0.15,
      shadows: [-0.1, 0.2, 0.05],
      highlights: [0.3, 0.15, -0.15],
    },
    grain: 0.5,
    vignette: 0.45,
  },
  {
    id: 'slide',
    name: 'Slide',
    grade: {
      exposure: -0.1,
      contrast: 0.45,
      saturation: 0.35,
      warmth: -0.05,
      shadows: [-0.1, -0.05, 0.25],
      highlights: [0.05, 0.05, 0],
    },
    grain: 0.2,
    vignette: 0.25,
  },
  {
    id: 'matte',
    name: 'Matte',
    grade: {
      contrast: -0.2,
      fade: 0.4,
      saturation: -0.2,
      warmth: 0.05,
      shadows: [-0.15, 0.05, 0.25],
      highlights: [0.15, 0.1, 0],
    },
    grain: 0.2,
    vignette: 0,
  },
  {
    id: 'retro',
    name: 'Retro',
    grade: {
      exposure: 0.05,
      contrast: 0.05,
      fade: 0.25,
      saturation: -0.2,
      warmth: 0.6,
      tint: 0.15,
      shadows: [0.25, 0.05, -0.15],
      highlights: [0.3, 0.12, -0.25],
    },
    grain: 0.35,
    vignette: 0.35,
  },
  {
    id: 'cinema',
    name: 'Cinema',
    grade: {
      contrast: 0.25,
      fade: 0.1,
      saturation: 0.05,
      warmth: 0.05,
      shadows: [-0.4, 0.1, 0.35],
      highlights: [0.35, 0.1, -0.3],
    },
    grain: 0.15,
    vignette: 0.3,
  },
  {
    id: 'mono',
    name: 'Mono',
    grade: { contrast: 0.3, fade: 0.08, saturation: -1 },
    grain: 0.45,
    vignette: 0.3,
  },
]

const LOOKS_BY_ID = new Map(FILM_LOOKS.map((f) => [f.id, f]))

/** No look and no adjustments: the photo as it is. */
export const NEUTRAL_LOOK: LayerLook = {
  film: null,
  strength: 1,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  grain: 0,
  vignette: 0,
}

export function isNeutralLook(look: LayerLook): boolean {
  return (
    look.film === null &&
    !look.brightness &&
    !look.contrast &&
    !look.saturation &&
    !look.warmth &&
    !look.grain &&
    !look.vignette
  )
}

/** Switch to a preset (or none), at full strength with its own grain and vignette. Adjustments stay. */
export function withFilm(look: LayerLook, film: FilmLookId | null): LayerLook {
  const preset = film && LOOKS_BY_ID.get(film)
  return {
    ...look,
    film: preset ? film : null,
    strength: 1,
    grain: preset ? preset.grain : 0,
    vignette: preset ? preset.vignette : 0,
  }
}

/** Two looks with the same key grade the same. */
export function lookKey(look: LayerLook): string {
  const n = (v: number) => v.toFixed(2)
  return [
    look.film ?? '-',
    look.film ? n(look.strength) : '',
    n(look.brightness),
    n(look.contrast),
    n(look.saturation),
    n(look.warmth),
    n(look.grain),
    n(look.vignette),
  ].join('|')
}

/** The preset scaled by its strength, with the adjustments added. */
function resolveGrade(look: LayerLook): Grade {
  const preset = (look.film && LOOKS_BY_ID.get(look.film)?.grade) || {}
  const k = look.film ? look.strength : 0
  const tone = (rgb: Rgb | undefined): Rgb => (rgb ? [rgb[0] * k, rgb[1] * k, rgb[2] * k] : [0, 0, 0])
  return {
    exposure: (preset.exposure ?? 0) * k + look.brightness,
    contrast: Math.max(-1, (preset.contrast ?? 0) * k + look.contrast),
    fade: (preset.fade ?? 0) * k,
    saturation: Math.max(-1, (preset.saturation ?? 0) * k + look.saturation),
    warmth: (preset.warmth ?? 0) * k + look.warmth,
    tint: (preset.tint ?? 0) * k,
    shadows: tone(preset.shadows),
    highlights: tone(preset.highlights),
  }
}

/** How far each 0–1 grade value reaches, in 0–1 color. */
const WARMTH_GAIN = 0.12
const TINT_GAIN = 0.08
const EXPOSURE_GAMMA = 0.7
const FADE_BLACK = 0.22
const FADE_WHITE = 0.05
const SPLIT_TONE = 0.1
const GRAIN_AMOUNT = 0.3
const VIGNETTE_DARKEN = 0.7

/** One channel's tone curve: white balance gain, exposure, contrast, then fade. 256 entries, 0–1. */
function toneCurve(gain: number, g: Grade): Float32Array {
  const lut = new Float32Array(256)
  const gamma = 2 ** (-EXPOSURE_GAMMA * g.exposure)
  const a = 1 + g.contrast
  const black = FADE_BLACK * g.fade
  const white = 1 - FADE_WHITE * g.fade
  for (let i = 0; i < 256; i++) {
    let v = Math.min(1, (i / 255) * gain) ** gamma
    if (g.contrast > 0) {
      const p = v ** a
      v = p / (p + (1 - v) ** a)
    } else if (g.contrast < 0) {
      v = 0.5 + (v - 0.5) * (1 + 0.5 * g.contrast)
    }
    lut[i] = black + v * (white - black)
  }
  return lut
}

/** A repeatable value in [-1, 1] for a grid point, spread like the sum of two uniforms. */
function noise(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ seed
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return ((h & 0xffff) + (h >>> 16)) / 65535 - 1
}

/** A seed for the grain from a string, so the same photo always gets the same grain. */
export function grainSeed(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Grade RGBA pixels in place. `grainCell` is the size of a grain in these pixels: below 1 the grain
 * is weaker, the way finer grain averages out in a smaller copy. Alpha is left alone.
 */
export function gradePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  look: LayerLook,
  seed: number,
  grainCell: number,
) {
  const g = resolveGrade(look)
  const lutR = toneCurve(1 + WARMTH_GAIN * g.warmth + 0.02 * g.tint, g)
  const lutG = toneCurve(1 + 0.02 * g.warmth - TINT_GAIN * g.tint, g)
  const lutB = toneCurve(1 - WARMTH_GAIN * g.warmth + 0.02 * g.tint, g)
  const sat = 1 + g.saturation
  const [sr, sg, sb] = g.shadows
  const [hr, hg, hb] = g.highlights

  const grain = look.grain * GRAIN_AMOUNT * Math.min(1, grainCell)
  // Above a pixel a grain spans several, so the noise lives on a coarser grid, sampled smoothly.
  const cell = Math.max(1, grainCell)
  const gw = Math.ceil(width / cell) + 2
  const grid = grain && cell > 1 ? new Float32Array(gw * (Math.ceil(height / cell) + 2)) : null
  if (grid) for (let i = 0; i < grid.length; i++) grid[i] = noise(i % gw, Math.floor(i / gw), seed)

  const vignette = look.vignette * VIGNETTE_DARKEN
  const colTerm = new Float32Array(width)
  for (let x = 0; x < width; x++) colTerm[x] = (((x + 0.5) / width) * 2 - 1) ** 2

  for (let y = 0; y < height; y++) {
    const rowTerm = (((y + 0.5) / height) * 2 - 1) ** 2
    const gy = y / cell
    const gy0 = Math.floor(gy)
    const fy = gy - gy0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      let r = lutR[data[i]!]!
      let gr = lutG[data[i + 1]!]!
      let b = lutB[data[i + 2]!]!

      let l = 0.2126 * r + 0.7152 * gr + 0.0722 * b
      if (sat !== 1) {
        r = l + (r - l) * sat
        gr = l + (gr - l) * sat
        b = l + (b - l) * sat
      }
      const ws = SPLIT_TONE * (1 - l) * (1 - l)
      const wh = SPLIT_TONE * l * l
      r += sr * ws + hr * wh
      gr += sg * ws + hg * wh
      b += sb * ws + hb * wh

      let k = 1
      if (vignette) k -= vignette * smoothstep(0.2, 1, (colTerm[x]! + rowTerm) / 2)
      let n = 0
      if (grain) {
        if (grid) {
          const gx = x / cell
          const gx0 = Math.floor(gx)
          const fx = gx - gx0
          const j = gy0 * gw + gx0
          const top = grid[j]! + (grid[j + 1]! - grid[j]!) * fx
          const bottom = grid[j + gw]! + (grid[j + gw + 1]! - grid[j + gw]!) * fx
          n = top + (bottom - top) * fy
        } else {
          n = noise(x, y, seed)
        }
        // Grain shows most in the midtones, as on film.
        l = Math.min(1, Math.max(0, l))
        n *= grain * (0.25 + 3 * l * (1 - l))
      }
      data[i] = (r * k + n) * 255
      data[i + 1] = (gr * k + n) * 255
      data[i + 2] = (b * k + n) * 255
    }
  }
}
