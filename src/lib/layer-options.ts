import type { IconName } from '../components/icons'
import type { FitMode } from '../types'

/** What "Cut out" does with the subject: replace the photo, add it above, or add it over a blur. */
export type CutoutMode = 'replace' | 'layer' | 'portrait'

export const FIT_OPTIONS: { value: FitMode; label: string; hint: string }[] = [
  { value: 'fill', label: 'Fill slides', hint: 'Cover every slide; pick it again to spread over slides you add' },
  { value: 'fit', label: 'Fit', hint: 'Show the whole photo across the slides' },
  { value: 'free', label: 'Free', hint: 'Fit inside one slide, then place it anywhere' },
]

export const CUTOUT_OPTIONS: { mode: CutoutMode; icon: IconName; label: string; hint: string }[] = [
  { mode: 'replace', icon: 'cutout', label: 'Remove background', hint: 'Swap the photo for its subject' },
  { mode: 'layer', icon: 'layers', label: 'Cut out to new layer', hint: 'Keep the photo, with the subject on top' },
  { mode: 'portrait', icon: 'aperture', label: 'Portrait', hint: 'Blur the photo behind a sharp subject' },
]
