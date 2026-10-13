import type { CarouselDoc, LightLeaks } from '../types'

/**
 * Light leaks on the seams between slides. On a roll of film a leak bleeds across neighbouring
 * frames, so here each one sits on a seam, in world space, and carries on as the viewer swipes.
 * `leakSpots` places them from the seed (pure maths); `drawLightLeaks` paints them with a
 * `screen` blend, for the stage and for `renderSlide`, so the editor and the export match.
 */

export const LEAK_COLORS: { label: string; value: string }[] = [
  { label: 'Warm', value: '#ff6a1f' },
  { label: 'Red', value: '#ff2d3a' },
  { label: 'Gold', value: '#ffb020' },
  { label: 'Pink', value: '#ff4f9a' },
]

export const DEFAULT_LIGHT_LEAKS: LightLeaks = { amount: 0, color: LEAK_COLORS[0]!.value, seed: 1 }

/** How likely each seam is to get a leak, so a long carousel isn't evenly striped. */
const SEAM_CHANCE = 0.7

/** One soft ellipse of light, in world pixels. `hot` ones lean redder, like a leak's burnt edge. */
export type LeakSpot = { x: number; y: number; rx: number; ry: number; angle: number; strength: number; hot: boolean }

/** mulberry32: a small, good-enough seeded generator. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A generator per seam, so adding or removing slides doesn't move the leaks on the others. */
function seamRandom(seed: number, seam: number): () => number {
  return random(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seam + 1, 0xc2b2ae35))
}

export function newLeakSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

/** The leaks around one edge at `x`: a large soft glow and, often, a smaller hot one beside it. */
function spotsAt(doc: CarouselDoc, x: number, r: () => number): LeakSpot[] {
  const m = Math.min(doc.slideW, doc.slideH)
  const main: LeakSpot = {
    x: x + (r() - 0.5) * 0.12 * doc.slideW,
    y: doc.slideH * (0.15 + 0.7 * r()),
    rx: m * (0.22 + 0.2 * r()),
    ry: doc.slideH * (0.35 + 0.4 * r()),
    angle: (r() - 0.5) * 0.3,
    strength: 0.75 + 0.25 * r(),
    hot: false,
  }
  if (r() > 0.6) return [main]
  const rx = m * (0.08 + 0.08 * r())
  const side = r() < 0.5 ? -1 : 1
  const accent: LeakSpot = {
    // Within 0.6 of its own width of the edge, so even a small one crosses it.
    x: x + (r() - 0.5) * 1.2 * rx,
    y: Math.min(doc.slideH, Math.max(0, main.y + side * doc.slideH * (0.2 + 0.2 * r()))),
    rx,
    ry: rx * (1.5 + 1.5 * r()),
    angle: (r() - 0.5) * 0.6,
    strength: 0.5 + 0.3 * r(),
    hot: true,
  }
  return [main, accent]
}

/**
 * Where the leaks fall: on about seven seams in ten, chosen by the seed, and always at least one.
 * A single slide has no seams, so its leak comes in from one side, like the end of a roll.
 */
export function leakSpots(doc: CarouselDoc): LeakSpot[] {
  const seed = doc.lightLeaks?.seed ?? DEFAULT_LIGHT_LEAKS.seed
  if (doc.count < 2) {
    const r = seamRandom(seed, 0)
    return spotsAt(doc, r() < 0.5 ? 0 : doc.slideW, r)
  }
  const spots: LeakSpot[] = []
  for (let k = 1; k < doc.count; k++) {
    const r = seamRandom(seed, k)
    if (r() < SEAM_CHANCE) spots.push(...spotsAt(doc, k * doc.slideW, r))
  }
  if (spots.length) return spots
  const pick = 1 + Math.floor(random(seed)() * (doc.count - 1))
  const r = seamRandom(seed, pick)
  r()
  return spotsAt(doc, pick * doc.slideW, r)
}

type Rgb = [number, number, number]

function hexRgb(hex: string): Rgb {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex)
  if (!m) return [255, 106, 31]
  const digits = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!
  const n = Number.parseInt(digits, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.max(0, Math.min(1, alpha))})`
}

const HOT: Rgb = [255, 40, 0]
const CORE: Rgb = [255, 244, 214]

/**
 * Paint the leaks over everything drawn so far, in world pixels (the context already maps world
 * to canvas). Each glow fades from a pale core through the leak's color to nothing.
 */
export function drawLightLeaks(ctx: CanvasRenderingContext2D, doc: CarouselDoc) {
  const leaks = doc.lightLeaks
  if (!leaks || leaks.amount <= 0) return
  const color = hexRgb(leaks.color)
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (const s of leakSpots(doc)) {
    const a = leaks.amount * s.strength
    const base = s.hot ? mix(color, HOT, 0.35) : color
    ctx.save()
    ctx.translate(s.x, s.y)
    ctx.rotate(s.angle)
    ctx.scale(s.rx, s.ry)
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    glow.addColorStop(0, rgba(mix(base, CORE, 0.55), a))
    glow.addColorStop(0.3, rgba(base, a * 0.8))
    glow.addColorStop(0.65, rgba(base, a * 0.3))
    glow.addColorStop(1, rgba(base, 0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, 0, 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}
