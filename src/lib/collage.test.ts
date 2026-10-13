import { describe, expect, it } from 'vitest'
import {
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

describe('itemSchedule', () => {
  const doc = withItems(createCollageDoc(), 3)
  const s = itemSchedule(doc)

  it('starts each subject a step after the last, with its photo a beat behind', () => {
    expect(s.map((x) => x.subjectInMs)).toEqual([0, 1500, 3000])
    expect(s.map((x) => x.backgroundInMs)).toEqual([700, 2200, 3700])
  })

  it('covers a photo once the next photo has fully faded in', () => {
    expect(s[0]!.coveredMs).toBe(1500 + 700 + 450)
    expect(s[1]!.coveredMs).toBe(3000 + 700 + 450)
  })

  it('keeps the last photo until the end', () => {
    expect(s[2]!.coveredMs).toBe(collageDurationMs(doc))
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
