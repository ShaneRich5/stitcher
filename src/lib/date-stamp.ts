import type { DateStampFormat, Layer, LayerDateStamp } from '../types'

/**
 * The orange date a point-and-shoot printed in the corner. `exifDate` reads the photo's own date
 * (a small JPEG/EXIF parser, no library) and `drawDateStamp` draws it as seven-segment digits
 * built from paths, so no font is downloaded and the stage matches the export.
 */

export const DATE_STAMP_FORMATS: { id: DateStampFormat; label: string }[] = [
  { id: 'ymd', label: "'98 10 12" },
  { id: 'mdy', label: "10 12 '98" },
  { id: 'dmy', label: '12.10.98' },
]

// ---------- reading the date ----------

const TAG_DATE_TIME = 0x0132
const TAG_EXIF_IFD = 0x8769
const TAG_DATE_TIME_ORIGINAL = 0x9003
const TAG_DATE_TIME_DIGITIZED = 0x9004

/** `YYYY:MM:DD HH:MM:SS` as `YYYY-MM-DD`, or null for a blank or zeroed date. */
function exifToIso(text: string): string | null {
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})/.exec(text)
  if (!m || m[1] === '0000' || m[2] === '00' || m[3] === '00') return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

/** The date tags of a TIFF block (EXIF's layout) from `start` to `end` in `v`. */
function tiffDate(v: DataView, start: number, end: number): string | null {
  if (start + 8 > end) return null
  const order = v.getUint16(start)
  const le = order === 0x4949
  if (!le && order !== 0x4d4d) return null
  if (v.getUint16(start + 2, le) !== 42) return null

  /** Tag → ASCII value (or, for pointers, the offset) from the IFD at `offset`. */
  const readIfd = (offset: number): Map<number, string | number> => {
    const tags = new Map<number, string | number>()
    const at = start + offset
    if (offset < 8 || at + 2 > end) return tags
    const count = v.getUint16(at, le)
    for (let i = 0; i < count; i++) {
      const e = at + 2 + i * 12
      if (e + 12 > end) break
      const tag = v.getUint16(e, le)
      const type = v.getUint16(e + 2, le)
      const n = v.getUint32(e + 4, le)
      if (type === 4 || type === 13) {
        tags.set(tag, v.getUint32(e + 8, le))
      } else if (type === 2 && n > 0) {
        // ASCII: up to 4 bytes sit in the entry itself, longer strings at an offset.
        const from = n <= 4 ? e + 8 : start + v.getUint32(e + 8, le)
        if (from + n > end) continue
        let text = ''
        for (let k = 0; k < n; k++) {
          const c = v.getUint8(from + k)
          if (c === 0) break
          text += String.fromCharCode(c)
        }
        tags.set(tag, text)
      }
    }
    return tags
  }

  const ifd0 = readIfd(v.getUint32(start + 4, le))
  const pointer = ifd0.get(TAG_EXIF_IFD)
  const exif = typeof pointer === 'number' ? readIfd(pointer) : new Map<number, string | number>()
  for (const value of [
    exif.get(TAG_DATE_TIME_ORIGINAL),
    exif.get(TAG_DATE_TIME_DIGITIZED),
    ifd0.get(TAG_DATE_TIME),
  ]) {
    const iso = typeof value === 'string' ? exifToIso(value) : null
    if (iso) return iso
  }
  return null
}

/** When a JPEG was taken, as `YYYY-MM-DD`, from its EXIF; null if it has none (or isn't a JPEG). */
export function exifDate(buffer: ArrayBuffer): string | null {
  const v = new DataView(buffer)
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null
  let p = 2
  while (p + 4 <= v.byteLength) {
    if (v.getUint8(p) !== 0xff) return null
    const marker = v.getUint8(p + 1)
    if (marker === 0xff) {
      p++ // fill byte
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      p += 2 // markers with no length
      continue
    }
    // The image data starts here; the metadata all comes before it.
    if (marker === 0xda || marker === 0xd9) return null
    const length = v.getUint16(p + 2)
    const body = p + 4
    const end = Math.min(v.byteLength, p + 2 + length)
    if (
      marker === 0xe1 &&
      body + 6 <= end &&
      v.getUint32(body) === 0x45786966 && // "Exif"
      v.getUint16(body + 4) === 0
    ) {
      const found = tiffDate(v, body + 6, end)
      if (found) return found
    }
    p += 2 + length
  }
  return null
}

/** A local date as `YYYY-MM-DD`. */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The photo's EXIF date; failing that, the file's last-modified date; failing that, today. */
export async function photoDate(blob: Blob): Promise<string> {
  try {
    // EXIF sits in the first 64 KB of a JPEG, after at most a JFIF header.
    const found = exifDate(await blob.slice(0, 256 * 1024).arrayBuffer())
    if (found) return found
  } catch {
    // Unreadable: fall through to the file's date.
  }
  return isoDate(new Date(blob instanceof File && blob.lastModified ? blob.lastModified : Date.now()))
}

// ---------- the text ----------

/**
 * The stamp's characters. Month and day lose a leading zero to a blank digit, as on the cameras,
 * except in the dotted format, where the zero holds the dots apart.
 */
export function stampText({ date, format }: LayerDateStamp): string {
  const [y = '', m = '', d = ''] = date.split('-')
  const yy = y.slice(-2)
  if (format === 'dmy') return `${d}.${m}.${yy}`
  const blank = (s: string) => (s.startsWith('0') ? ` ${s.slice(1)}` : s)
  return format === 'mdy' ? `${blank(m)} ${blank(d)} '${yy}` : `'${yy} ${blank(m)} ${blank(d)}`
}

// ---------- drawing ----------

/** Digit height as a share of the shorter side of the photo's visible part. */
const STAMP_SIZE = 0.045
/** Inset from that part's bottom-right corner, in digit heights. */
const STAMP_MARGIN = 1.1
const DIGIT_W = 0.56
const STROKE = 0.14
const GAP = 0.025
const SPACING = 0.2
const SLANT = 0.1

/** Which segments light up for each digit, from a (top) clockwise to f, then g (middle). */
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
}

function charWidth(c: string): number {
  return c === "'" || c === '.' ? STROKE + 0.1 : DIGIT_W
}

/** A segment from (x0, y0) to (x1, y0) or (x0, y1), as a six-sided bar with pointed ends. */
function segment(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, t: number) {
  const g = GAP
  if (y0 === y1) {
    const a = x0 + g
    const b = x1 - g
    ctx.moveTo(a, y0)
    ctx.lineTo(a + t / 2, y0 - t / 2)
    ctx.lineTo(b - t / 2, y0 - t / 2)
    ctx.lineTo(b, y0)
    ctx.lineTo(b - t / 2, y0 + t / 2)
    ctx.lineTo(a + t / 2, y0 + t / 2)
  } else {
    const a = y0 + g
    const b = y1 - g
    ctx.moveTo(x0, a)
    ctx.lineTo(x0 + t / 2, a + t / 2)
    ctx.lineTo(x0 + t / 2, b - t / 2)
    ctx.lineTo(x0, b)
    ctx.lineTo(x0 - t / 2, b - t / 2)
    ctx.lineTo(x0 - t / 2, a + t / 2)
  }
  ctx.closePath()
}

/** Add one character's path, one digit-height tall, with its top-left at (x, 0). */
function charPath(ctx: CanvasRenderingContext2D, c: string, x: number) {
  const t = STROKE
  if (c === "'") {
    segment(ctx, x + t / 2 + 0.05, 0, x + t / 2 + 0.05, 0.32, t)
    return
  }
  if (c === '.') {
    ctx.rect(x + 0.05, 1 - t, t, t)
    return
  }
  const lit = SEGMENTS[c]
  if (!lit) return
  const l = x + t / 2
  const r = x + DIGIT_W - t / 2
  const top = t / 2
  const mid = 0.5
  const bottom = 1 - t / 2
  for (const s of lit) {
    if (s === 'a') segment(ctx, l, top, r, top, t)
    else if (s === 'b') segment(ctx, r, top, r, mid, t)
    else if (s === 'c') segment(ctx, r, mid, r, bottom, t)
    else if (s === 'd') segment(ctx, l, bottom, r, bottom, t)
    else if (s === 'e') segment(ctx, l, mid, l, bottom, t)
    else if (s === 'f') segment(ctx, l, top, l, mid, t)
    else if (s === 'g') segment(ctx, l, mid, r, mid, t)
  }
}

type Area = { x: number; y: number; width: number; height: number }

/**
 * The part of the layer's box the stamp should sit in, in the box's own units as seen on screen
 * (left to right, whatever the flip): the part over the slides when the layer isn't turned, since
 * a Fill photo usually runs past the bottom of the row, otherwise the whole box.
 */
export function stampArea(
  layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  row?: { width: number; height: number },
): Area {
  const whole = { x: 0, y: 0, width: layer.width, height: layer.height }
  if (!row || Math.abs(layer.rotation) > 0.5) return whole
  const x0 = Math.max(0, -layer.x)
  const y0 = Math.max(0, -layer.y)
  const x1 = Math.min(layer.width, row.width - layer.x)
  const y1 = Math.min(layer.height, row.height - layer.y)
  if (x1 - x0 < 1 || y1 - y0 < 1) return whole
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/**
 * Draw the layer's date stamp in its box (the context set up as for `drawLayerContent`). A flipped
 * layer is mirrored back first, so the digits read the right way and sit bottom right on screen.
 * The glow is a canvas shadow, which ignores the transform, so `pxPerWorld` sizes it.
 */
export function drawDateStamp(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  pxPerWorld: number,
  row?: { width: number; height: number },
) {
  if (!layer.dateStamp) return
  const text = stampText(layer.dateStamp)
  const area = stampArea(layer, row)
  const h = STAMP_SIZE * Math.min(area.width, area.height)
  if (h * pxPerWorld < 2) return
  const chars = [...text]
  const width = chars.reduce((w, c) => w + charWidth(c) + SPACING, -SPACING)

  ctx.save()
  if (layer.flipX) {
    ctx.translate(layer.width, 0)
    ctx.scale(-1, 1)
  }
  const right = area.x + area.width - STAMP_MARGIN * h
  const bottom = area.y + area.height - STAMP_MARGIN * h
  ctx.translate(right - width * h, bottom - h)
  ctx.scale(h, h)
  // Lean the digits forward from their baseline.
  ctx.transform(1, 0, -SLANT, 1, SLANT, 0)
  ctx.beginPath()
  let x = 0
  for (const c of chars) {
    charPath(ctx, c, x)
    x += charWidth(c) + SPACING
  }
  ctx.globalAlpha *= 0.92
  ctx.shadowColor = 'rgba(255, 96, 0, 0.85)'
  ctx.shadowBlur = 0.45 * h * pxPerWorld
  ctx.fillStyle = '#ff7b1c'
  ctx.fill()
  // A paler core, where the light burned in hardest.
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = 'rgba(255, 196, 120, 0.45)'
  ctx.fill()
  ctx.restore()
}
