import { describe, expect, it } from 'vitest'
import { exifDate, isoDate, photoDate, stampArea, stampText } from './date-stamp'

type Tag = { tag: number; text: string }

/**
 * A minimal JPEG: SOI, a JFIF APP0, then an EXIF APP1 whose IFD0 holds `ifd0` tags and, when
 * `exif` is given, a pointer to an EXIF IFD holding those.
 */
function jpeg({ ifd0 = [], exif, le = true }: { ifd0?: Tag[]; exif?: Tag[]; le?: boolean }): ArrayBuffer {
  const tiff = new Uint8Array(1024)
  const v = new DataView(tiff.buffer)
  v.setUint16(0, le ? 0x4949 : 0x4d4d)
  v.setUint16(2, 42, le)
  v.setUint32(4, 8, le)
  let heap = 512

  const writeIfd = (at: number, tags: { tag: number; type: number; value: number | string }[]) => {
    v.setUint16(at, tags.length, le)
    tags.forEach((t, i) => {
      const e = at + 2 + i * 12
      v.setUint16(e, t.tag, le)
      v.setUint16(e + 2, t.type, le)
      if (typeof t.value === 'number') {
        v.setUint32(e + 4, 1, le)
        v.setUint32(e + 8, t.value, le)
      } else {
        const bytes = [...t.value].map((c) => c.charCodeAt(0)).concat(0)
        v.setUint32(e + 4, bytes.length, le)
        v.setUint32(e + 8, heap, le)
        bytes.forEach((b, k) => v.setUint8(heap + k, b))
        heap += bytes.length
      }
    })
    v.setUint32(at + 2 + tags.length * 12, 0, le)
  }

  const exifAt = 200
  writeIfd(8, [
    ...ifd0.map((t) => ({ tag: t.tag, type: 2, value: t.text })),
    ...(exif ? [{ tag: 0x8769, type: 4, value: exifAt }] : []),
  ])
  if (exif) writeIfd(exifAt, exif.map((t) => ({ tag: t.tag, type: 2, value: t.text })))

  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]
  const app1Len = 2 + 6 + tiff.length
  const app1 = [0xff, 0xe1, app1Len >> 8, app1Len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0]
  const sos = [0xff, 0xda, 0x00, 0x02]
  return new Uint8Array([0xff, 0xd8, ...app0, ...app1, ...tiff, ...sos]).buffer
}

describe('exifDate', () => {
  it('reads DateTimeOriginal from the EXIF IFD', () => {
    expect(exifDate(jpeg({ exif: [{ tag: 0x9003, text: '2019:07:04 10:11:12' }] }))).toBe('2019-07-04')
  })

  it('reads big-endian (Motorola) EXIF too', () => {
    expect(exifDate(jpeg({ le: false, exif: [{ tag: 0x9003, text: '1998:10:12 08:00:00' }] }))).toBe('1998-10-12')
  })

  it('prefers the original date over the digitized one and the file date', () => {
    const buffer = jpeg({
      ifd0: [{ tag: 0x0132, text: '2024:01:01 00:00:00' }],
      exif: [
        { tag: 0x9004, text: '2020:02:02 00:00:00' },
        { tag: 0x9003, text: '2019:07:04 10:11:12' },
      ],
    })
    expect(exifDate(buffer)).toBe('2019-07-04')
  })

  it("falls back to IFD0's DateTime", () => {
    expect(exifDate(jpeg({ ifd0: [{ tag: 0x0132, text: '2021:12:25 09:30:00' }] }))).toBe('2021-12-25')
  })

  it('skips a zeroed date', () => {
    const buffer = jpeg({
      ifd0: [{ tag: 0x0132, text: '2021:12:25 09:30:00' }],
      exif: [{ tag: 0x9003, text: '0000:00:00 00:00:00' }],
    })
    expect(exifDate(buffer)).toBe('2021-12-25')
  })

  it('is null without EXIF, or for something that is not a JPEG', () => {
    expect(exifDate(jpeg({}))).toBeNull()
    expect(exifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull()
    expect(exifDate(new ArrayBuffer(0))).toBeNull()
  })

  it('survives a truncated file', () => {
    const whole = jpeg({ exif: [{ tag: 0x9003, text: '2019:07:04 10:11:12' }] })
    for (const n of [3, 10, 30, 60, 300]) expect(() => exifDate(whole.slice(0, n))).not.toThrow()
  })
})

describe('photoDate', () => {
  it("uses the EXIF date, then the file's date", async () => {
    const withExif = new Blob([jpeg({ exif: [{ tag: 0x9003, text: '2019:07:04 10:11:12' }] })])
    expect(await photoDate(withExif)).toBe('2019-07-04')
    const modified = new Date(2015, 5, 20, 12).getTime()
    const file = new File([jpeg({})], 'a.jpg', { lastModified: modified })
    expect(await photoDate(file)).toBe('2015-06-20')
    expect(await photoDate(new Blob([jpeg({})]))).toBe(isoDate(new Date()))
  })
})

describe('stampText', () => {
  it('writes each format, blanking a leading zero except between dots', () => {
    expect(stampText({ date: '1998-10-12', format: 'ymd' })).toBe("'98 10 12")
    expect(stampText({ date: '1998-03-04', format: 'ymd' })).toBe("'98  3  4")
    expect(stampText({ date: '2019-07-04', format: 'mdy' })).toBe(" 7  4 '19")
    expect(stampText({ date: '2019-07-04', format: 'dmy' })).toBe('04.07.19')
  })
})

describe('stampArea', () => {
  const row = { width: 3240, height: 1350 }

  it('is the part of the photo over the slides', () => {
    // A Fill photo 1620 tall, centred on a 1350-tall row, runs 135 past the top and bottom.
    const area = stampArea({ x: 0, y: -135, width: 3240, height: 1620, rotation: 0 }, row)
    expect(area).toEqual({ x: 0, y: 135, width: 3240, height: 1350 })
  })

  it('is the whole box when the photo is turned, or with no row', () => {
    const layer = { x: -100, y: -100, width: 500, height: 400, rotation: 15 }
    expect(stampArea(layer, row)).toEqual({ x: 0, y: 0, width: 500, height: 400 })
    expect(stampArea({ ...layer, rotation: 0 })).toEqual({ x: 0, y: 0, width: 500, height: 400 })
  })

  it('is the whole box when the photo is off the slides', () => {
    expect(stampArea({ x: 4000, y: 0, width: 500, height: 400, rotation: 0 }, row)).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 400,
    })
  })
})
