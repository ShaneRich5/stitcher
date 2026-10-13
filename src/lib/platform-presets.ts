export type FormatPreset = {
  id: string
  /** A short name for the format, for where the ratio alone isn't enough. */
  name: string
  label: string
  hint: string
  width: number
  height: number
}

/** Slide sizes in pixels. Every slide in a carousel shares one format. */
export const FORMAT_PRESETS: FormatPreset[] = [
  { id: 'portrait', name: 'Portrait', label: '4:5', hint: 'Portrait: Instagram, Threads, Facebook, LinkedIn', width: 1080, height: 1350 },
  { id: 'square', name: 'Square', label: '1:1', hint: 'Square: Instagram, Threads, Facebook, LinkedIn, X', width: 1080, height: 1080 },
  { id: 'grid', name: 'Profile grid', label: '3:4', hint: 'Instagram posts that fill the profile grid', width: 1080, height: 1440 },
  { id: 'pin', name: 'Pinterest', label: '2:3', hint: 'Pinterest pins', width: 1000, height: 1500 },
  { id: 'story', name: 'Stories', label: '9:16', hint: 'Stories, Reels, TikTok photos, YouTube Shorts', width: 1080, height: 1920 },
  { id: 'wide', name: 'Widescreen', label: '16:9', hint: 'Widescreen: X, YouTube', width: 1600, height: 900 },
  { id: 'landscape', name: 'Landscape', label: '1.91:1', hint: 'Landscape: Facebook, LinkedIn', width: 1080, height: 566 },
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
