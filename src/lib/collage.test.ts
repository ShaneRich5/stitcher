import { describe, expect, it } from 'vitest'
import {
  arrivalMs,
  backgroundAlpha,
  collageDurationMs,
  collageStyleFor,
  COLLAGE_STYLES,
  createCollageDoc,
  cutoutState,
  instagramFrame,
  itemIndexAt,
  itemSchedule,
  itemSettledMs,
  pacePresetFor,
  PACE_PRESETS,
  turnMs,
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
  const doc: CollageDoc = { ...withItems(createCollageDoc(), 3), style: 'stack', backgrounds: 'stay' }
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

describe('stacked photos that fade back out', () => {
  // Steady: a subject every 1.5 s, its photo 0.7 s behind, 0.45 s fades, a 1.5 s end hold.
  const doc: CollageDoc = { ...withItems(createCollageDoc(), 3), style: 'stack' }
  const end = collageDurationMs(doc)

  it('is the stack’s default', () => {
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

describe('the Instagram collage (the default)', () => {
  // Steady: a 1.5 s turn per photo; an arrival is the subject, then its photo 0.7 s later, 0.45 s fades.
  const doc = withItems(createCollageDoc(), 3)

  it('is the default style', () => {
    expect(createCollageDoc().style).toBe('instagram')
    expect(collageStyleFor(createCollageDoc())).toBe('instagram')
  })

  it('gives each photo a turn, ending each with the next photo’s arrival', () => {
    expect(turnMs(doc)).toBe(1500)
    expect([0, 1, 2].map((k) => arrivalMs(doc, k))).toEqual([350, 1850, 3350])
    expect(collageDurationMs(doc)).toBe(4500)
  })

  it('opens on pic 1 in full, with no cutouts', () => {
    expect(instagramFrame(doc, 0)).toEqual({ base: 0, arriving: null })
    expect(instagramFrame(doc, 349)).toEqual({ base: 0, arriving: null })
  })

  it('brings pic 2’s subject in over pic 1, then pic 2’s photo over pic 1', () => {
    // The subject fades in over 0.35–0.8 s; the photo from 1.05 s, fully in at the turn's end.
    expect(instagramFrame(doc, 800)).toEqual({ base: 0, arriving: { index: 1, subject: 1, photo: 0 } })
    const crossing = instagramFrame(doc, 1275)
    expect(crossing.base).toBe(0)
    expect(crossing.arriving!.index).toBe(1)
    expect(crossing.arriving!.photo).toBeCloseTo(0.5)
    // Once its photo is in, the subject is part of it, so it isn't drawn on top any more.
    expect(instagramFrame(doc, 1500)).toEqual({ base: 0, arriving: { index: 1, subject: 0, photo: 1 } })
  })

  it('then pic 3 over pic 2, then pic 1 over pic 3', () => {
    expect(instagramFrame(doc, 2400)).toMatchObject({ base: 1, arriving: { index: 2 } })
    expect(instagramFrame(doc, 3900)).toMatchObject({ base: 2, arriving: { index: 0 } })
  })

  it('ends on pic 1 in full, so the loop meets its start', () => {
    expect(instagramFrame(doc, collageDurationMs(doc))).toEqual({ base: 2, arriving: { index: 0, subject: 0, photo: 1 } })
  })

  it('knows which photo is arriving, and when each is fully in', () => {
    expect([0, 400, 2000, 3400, 4499].map((t) => itemIndexAt(doc, t))).toEqual([0, 1, 2, 0, 0])
    expect([0, 1, 2].map((i) => itemSettledMs(doc, i))).toEqual([0, 1500, 3000])
  })

  it('lays out the sequence: each subject leads its photo in, and pic 1 also opens it', () => {
    const s = itemSchedule(doc)
    expect(s.map((x) => [x.subjectInMs, x.subjectOutMs, x.backgroundInMs, x.goneMs])).toEqual([
      [3350, 4500, 4050, 4500],
      [350, 1500, 1050, 3000],
      [1850, 3000, 2550, 4500],
    ])
    expect(s.map((x) => x.leadUntilMs)).toEqual([1500, null, null])
  })

  it('never lets arrivals overlap, even when the turn is set shorter than an arrival', () => {
    const quick = { ...doc, stepMs: 500 }
    expect(turnMs(quick)).toBe(1150)
    expect(arrivalMs(quick, 0)).toBe(0)
  })

  it('shows a lone photo throughout', () => {
    const one = withItems(createCollageDoc(), 1)
    expect(collageDurationMs(one)).toBe(1500)
    expect(instagramFrame(one, 1000)).toEqual({ base: 0, arriving: null })
  })
})

describe('collageStyleFor', () => {
  it('names each offered style from the doc it makes', () => {
    for (const style of COLLAGE_STYLES) {
      expect(collageStyleFor({ ...createCollageDoc(), ...style.patch })).toBe(style.id)
    }
  })
})
