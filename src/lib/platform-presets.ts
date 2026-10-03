export type FormatPreset = {
  id: string
  label: string
  hint: string
  width: number
  height: number
}

/** Slide sizes in pixels. Every slide in a carousel shares one format. */
export const FORMAT_PRESETS: FormatPreset[] = [
  { id: 'portrait', label: '4:5', hint: 'Portrait: Instagram, LinkedIn', width: 1080, height: 1350 },
  { id: 'square', label: '1:1', hint: 'Square', width: 1080, height: 1080 },
  { id: 'grid', label: '3:4', hint: 'Instagram profile grid', width: 1080, height: 1440 },
  { id: 'story', label: '9:16', hint: 'Stories, Reels, TikTok photos', width: 1080, height: 1920 },
  { id: 'landscape', label: '1.91:1', hint: 'Landscape', width: 1080, height: 566 },
]

export const BACKGROUND_SWATCHES: { label: string; value: string | null }[] = [
  { label: 'Transparent', value: null },
  { label: 'White', value: '#ffffff' },
  { label: 'Linen', value: '#f7efe3' },
  { label: 'Ink', value: '#1d1b18' },
  { label: 'Teal', value: '#2f6f73' },
]

export const OUTPUT_SIZE_PRESETS = [1080, 720, 480] as const

/** The GIF tool always needs an opaque background, so it has no transparent option. */
export const GIF_BACKGROUNDS: { label: string; value: string }[] = [
  { label: 'Black', value: '#000000' },
  { label: 'White', value: '#ffffff' },
  { label: 'Linen', value: '#f7efe3' },
  { label: 'Ink', value: '#1d1b18' },
  { label: 'Teal', value: '#2f6f73' },
]
