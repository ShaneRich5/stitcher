export type SizePreset = {
  id: string
  label: string
  width: number
  height: number
}

/** Common social frame sizes (pixels). */
export const CAROUSEL_PRESETS: SizePreset[] = [
  { id: 'ig-portrait', label: 'IG portrait 4:5', width: 1080, height: 1350 },
  { id: 'ig-square', label: 'IG square', width: 1080, height: 1080 },
  { id: 'ig-story', label: 'Story / Reel 9:16', width: 1080, height: 1920 },
  { id: 'ig-landscape', label: 'IG landscape', width: 1080, height: 566 },
]

export const OUTPUT_SIZE_PRESETS = [1080, 720, 480] as const

export function matchingPreset(
  width: number,
  height: number,
): SizePreset | undefined {
  return CAROUSEL_PRESETS.find((p) => p.width === width && p.height === height)
}
