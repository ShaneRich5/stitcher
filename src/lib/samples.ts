import friendUrl from '../assets/samples/friend.svg'
import sunsetUrl from '../assets/samples/sunset.svg'
import type { CollageItem, GifFrame } from '../types'
import { toBlob } from './export-carousel'
import { registerBlob } from './image-registry'

/**
 * What the GIF and Collage tools open with on a first visit, so the tool shows what it makes
 * before anything is added: the designs' sunset panorama (4:1) and a waving friend, drawn from
 * vector art at full size. Adding photos replaces them.
 */

/** The designs' art: a 4:1 sunset panorama and the friend, standing alone on transparent. */
export const SUNSET_ART = sunsetUrl
export const FRIEND_ART = friendUrl

/** Where the friend stands in the panorama, as fractions of its width and height (the designs' 1240 × 310 place). */
const FRIEND_IN_SUNSET = { x: 658 / 1240, y: 50 / 310, h: 260 / 310 }
/** The friend's art is 600 × 900. */
const FRIEND_RATIO = 600 / 900

export type Rect = { x: number; y: number; width: number; height: number }

/** The GIF sample: six 4:5 frames panning right across the sunset, the friend sliding in over the last three. */
export const GIF_SAMPLE_PANS = [0, 0.145, 0.29, 0.42, 0.516, 0.613]

/** One GIF sample frame, `height` tall: where the panorama and the friend go in it. */
export function gifSampleLayout(index: number, height: number): { width: number; height: number; sunset: Rect; friend: Rect } {
  const width = Math.round(height * 0.8)
  const pw = 4 * height
  const x = -GIF_SAMPLE_PANS[index]! * pw
  const fh = FRIEND_IN_SUNSET.h * height
  return {
    width,
    height,
    sunset: { x, y: 0, width: pw, height },
    friend: { x: x + FRIEND_IN_SUNSET.x * pw, y: FRIEND_IN_SUNSET.y * height, width: fh * FRIEND_RATIO, height: fh },
  }
}

/** The Collage sample: one trip, five photos of the same friend, each a different stretch of the sunset. */
export const COLLAGE_SAMPLE_PHOTOS = [
  { name: 'lake.jpg', pan: 0.3, x: 0.04, h: 0.58, flip: false, tone: 'none' },
  { name: 'ridge.jpg', pan: 0.04, x: 0.26, h: 0.62, flip: true, tone: 'saturate(1.15)' },
  { name: 'trail.jpg', pan: 0.55, x: 0.1, h: 0.46, flip: false, tone: 'hue-rotate(-12deg)' },
  { name: 'dusk.jpg', pan: 0.8, x: 0.36, h: 0.52, flip: true, tone: 'brightness(0.9)' },
  { name: 'harbor.jpg', pan: 0.97, x: 0.12, h: 0.66, flip: false, tone: 'saturate(1.25) hue-rotate(8deg)' },
] as const

/** One Collage sample photo, `width` × `height`: where the panorama and the friend go in it. */
export function collageSampleLayout(index: number, width: number, height: number): { sunset: Rect; friend: Rect } {
  const photo = COLLAGE_SAMPLE_PHOTOS[index]!
  const pw = 4 * height
  const fh = photo.h * height
  return {
    sunset: { x: -photo.pan * (pw - width), y: 0, width: pw, height },
    friend: { x: photo.x * width, y: (1.02 - photo.h) * height, width: fh * FRIEND_RATIO, height: fh },
  }
}

function loadArt(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load the sample art'))
    image.src = url
  })
}

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  return [c, ctx]
}

function drawArt(ctx: CanvasRenderingContext2D, image: HTMLImageElement, r: Rect, flip = false) {
  if (!flip) return ctx.drawImage(image, r.x, r.y, r.width, r.height)
  ctx.save()
  ctx.translate(r.x + r.width, r.y)
  ctx.scale(-1, 1)
  ctx.drawImage(image, 0, 0, r.width, r.height)
  ctx.restore()
}

async function register(c: HTMLCanvasElement, format: 'png' | 'jpeg'): Promise<string> {
  const id = crypto.randomUUID()
  await registerBlob(id, await toBlob(c, format))
  return id
}

/** The GIF sample's six frames, registered as 1080 × 1350 JPEGs. */
export async function makeGifSample(): Promise<GifFrame[]> {
  const [sunset, friend] = await Promise.all([loadArt(sunsetUrl), loadArt(friendUrl)])
  return Promise.all(
    GIF_SAMPLE_PANS.map(async (_, i) => {
      const layout = gifSampleLayout(i, 1350)
      const [c, ctx] = canvas(layout.width, layout.height)
      drawArt(ctx, sunset, layout.sunset)
      drawArt(ctx, friend, layout.friend)
      return {
        id: crypto.randomUUID(),
        name: `sunset-${i + 1}.jpg`,
        imageId: await register(c, 'jpeg'),
        naturalWidth: layout.width,
        naturalHeight: layout.height,
      }
    }),
  )
}

/**
 * The Collage sample's five photos at the doc's size, each with its cutout ready (the friend
 * alone, the photo's size), so nothing waits on the background remover.
 */
export async function makeCollageSample(width: number, height: number): Promise<CollageItem[]> {
  const [sunset, friend] = await Promise.all([loadArt(sunsetUrl), loadArt(friendUrl)])
  return Promise.all(
    COLLAGE_SAMPLE_PHOTOS.map(async (photo, i) => {
      const layout = collageSampleLayout(i, width, height)
      const [c, ctx] = canvas(width, height)
      ctx.filter = photo.tone
      drawArt(ctx, sunset, layout.sunset)
      ctx.filter = 'none'
      drawArt(ctx, friend, layout.friend, photo.flip)
      const [cut, cutCtx] = canvas(width, height)
      drawArt(cutCtx, friend, layout.friend, photo.flip)
      return {
        id: crypto.randomUUID(),
        name: photo.name,
        imageId: await register(c, 'jpeg'),
        naturalWidth: width,
        naturalHeight: height,
        cutoutId: await register(cut, 'png'),
        failed: false,
      }
    }),
  )
}
