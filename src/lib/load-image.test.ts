import { describe, expect, it } from 'vitest'
import { isHeicFile, isImageFile, skippedMessage } from './load-image'

describe('isImageFile', () => {
  it('trusts an image type', () => {
    expect(isImageFile({ name: 'photo', type: 'image/jpeg' })).toBe(true)
    expect(isImageFile({ name: 'IMG_0001.HEIC', type: 'image/heic' })).toBe(true)
  })

  it('falls back to the name when the type is empty or generic', () => {
    expect(isImageFile({ name: 'IMG_0001.HEIC', type: '' })).toBe(true)
    expect(isImageFile({ name: 'shot.webp', type: '' })).toBe(true)
    expect(isImageFile({ name: 'scan.AVIF', type: 'application/octet-stream' })).toBe(true)
    expect(isImageFile({ name: 'notes.txt', type: '' })).toBe(false)
  })

  it('rejects other types, whatever the name', () => {
    expect(isImageFile({ name: 'doc.pdf', type: 'application/pdf' })).toBe(false)
    expect(isImageFile({ name: 'fake.jpg', type: 'text/plain' })).toBe(false)
  })
})

describe('isHeicFile', () => {
  it('matches HEIC and HEIF by type or extension', () => {
    expect(isHeicFile({ name: 'a', type: 'image/heic' })).toBe(true)
    expect(isHeicFile({ name: 'a', type: 'image/heif-sequence' })).toBe(true)
    expect(isHeicFile({ name: 'IMG_0001.heif', type: '' })).toBe(true)
    expect(isHeicFile({ name: 'a.jpg', type: 'image/jpeg' })).toBe(false)
  })
})

describe('skippedMessage', () => {
  it('is null when nothing was skipped', () => {
    expect(skippedMessage([])).toBeNull()
  })

  it('names a single file, and counts several', () => {
    expect(skippedMessage([{ name: 'doc.pdf', reason: 'not-image' }])).toBe("doc.pdf isn't an image")
    expect(
      skippedMessage([
        { name: 'a.pdf', reason: 'not-image' },
        { name: 'b.txt', reason: 'not-image' },
      ]),
    ).toBe("2 files aren't images")
    expect(skippedMessage([{ name: 'x.png', reason: 'decode' }])).toBe('Could not open x.png')
  })

  it('explains HEIC, and joins different reasons', () => {
    expect(
      skippedMessage([
        { name: 'IMG_1.HEIC', reason: 'heic' },
        { name: 'b.txt', reason: 'not-image' },
      ]),
    ).toBe("b.txt isn't an image. IMG_1.HEIC couldn't be converted here. Export as JPEG, or open Stitcher in Safari")
  })
})
