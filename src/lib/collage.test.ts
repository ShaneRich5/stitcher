import { describe, expect, it } from 'vitest'
import {
  backgroundAlpha,
  collageDurationMs,
  createCollageDoc,
  cutoutState,
  itemSchedule,
  pacePresetFor,
  PACE_PRESETS,
  type CollageDoc,
} from './collage'
import type { CollageItem } from '../types'

const item = (id: string): CollageItem => ({
  id,
  name: `${id}.jpg`,
  imageId: id,
  naturalWidth: 1080,
  naturalHeight: 1920,
  cutoutId: null,
  failed: false,
})

const withItems = (doc: CollageDoc, n: number): CollageDoc => ({
  ...doc,
  items: Array.from({ length: n }, (_, i) => item(String(i))),
})

describe('pacePresetFor', () => {
  it('names the default timing Steady', () => {
    expect(pacePresetFor(createCollageDoc())).toBe('steady')
  })

  it('matches every preset it offers', () => {
    for (const p of PACE_PRESETS) expect(pacePresetFor({ ...createCollageDoc(), ...p.pace })).toBe(p.id)
  })

  it('is null once any of the four timings is tuned by hand', () => {
    expect(pacePresetFor({ ...createCollageDoc(), fadeMs: 500 })).toBeNull()
  })
})

describe('itemSchedule, with photos that stay', () => {
  const doc: CollageDoc = { ...withItems(createCollageDoc(), 3), backgrounds: 'stay' }
  const s = itemSchedule(doc)

  it('starts each subject a step after the last, with its photo a beat behind', () => {
    expect(s.map((x) => x.subjectInMs)).toEqual([0, 1500, 3000])
    expect(s.map((x) => x.backgroundInMs)).toEqual([700, 2200, 3700])
  })

  it('covers a photo once the next photo has fully faded in', () => {
    expect(s[0]!.goneMs).toBe(1500 + 700 + 450)
    expect(s[1]!.goneMs).toBe(3000 + 700 + 450)
    expect(s.every((x) => !x.fadesOut)).toBe(true)
  })

  it('keeps the last photo until the end', () => {
    expect(s[2]!.goneMs).toBe(collageDurationMs(doc))
  })

  it('is empty without photos', () => {
    expect(itemSchedule(createCollageDoc())).toEqual([])
  })
})

describe('cutoutState', () => {
  it('follows the cutout from waiting to cutting to done', () => {
    const a = item('a')
    expect(cutoutState(a, null)).toBe('waiting')
    expect(cutoutState(a, 'a')).toBe('cutting')
    expect(cutoutState({ ...a, cutoutId: 'cut' }, null)).toBe('ready')
  })

  it('reports a failed cutout, even while another photo is being cut out', () => {
    expect(cutoutState({ ...item('a'), failed: true }, 'b')).toBe('failed')
  })
})

describe('photos that fade back out (the default)', () => {
  // Steady: a subject every 1.5 s, its photo 0.7 s behind, 0.45 s fades, a 1.5 s end hold.
  const doc = withItems(createCollageDoc(), 3)
  const end = collageDurationMs(doc)

  it('is the default', () => {
    expect(createCollageDoc().backgrounds).toBe('fade')
  })

  it('fades each photo in behind its subject, then out as the next subject arrives', () => {
    expect(backgroundAlpha(doc, 0, 700)).toBe(0)
    expect(backgroundAlpha(doc, 0, 1150)).toBe(1)
    expect(backgroundAlpha(doc, 0, 1500)).toBe(1)
    expect(backgroundAlpha(doc, 0, 1725)).toBeCloseTo(0.5)
    expect(backgroundAlpha(doc, 0, 1950)).toBe(0)
    expect(backgroundAlpha(doc, 1, 3225)).toBeCloseTo(0.5)
  })

  it('fades the last photo a step after it came, so the video ends on the subjects alone', () => {
    const s = itemSchedule(doc)
    expect(s.map((x) => x.goneMs)).toEqual([1950, 3450, 4950])
    expect(s.every((x) => x.fadesOut)).toBe(true)
    expect(backgroundAlpha(doc, 2, end)).toBe(0)
  })

  it('still has the last photo gone by the end when the end hold is short', () => {
    const short = { ...doc, holdEndMs: 0 }
    expect(backgroundAlpha(short, 2, collageDurationMs(short))).toBe(0)
    expect(itemSchedule(short)[2]!.goneMs).toBeLessThanOrEqual(collageDurationMs(short))
  })

  it('keeps the last photo to the end when photos stay', () => {
    expect(backgroundAlpha({ ...doc, backgrounds: 'stay' }, 2, end)).toBe(1)
  })
})
