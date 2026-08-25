import { GIFEncoder, applyPalette, quantize } from 'gifenc'

export type GifFrameSource = {
  image: CanvasImageSource
  naturalWidth: number
  naturalHeight: number
}

export type EncodeGifOptions = {
  frames: GifFrameSource[]
  /** Frame delay in milliseconds */
  delayMs: number
  /** Max output width/height; frames are fit inside this box */
  maxSize?: number
  /** Background fill behind letterboxed frames */
  background?: string
}

function fitContain(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): { width: number; height: number; x: number; y: number } {
  const scale = Math.min(boxW / srcW, boxH / srcH)
  const width = Math.max(1, Math.round(srcW * scale))
  const height = Math.max(1, Math.round(srcH * scale))
  return {
    width,
    height,
    x: Math.round((boxW - width) / 2),
    y: Math.round((boxH - height) / 2),
  }
}

/** Build an animated GIF blob from canvas-drawn frames (browser-only). */
export async function encodeGifBlob(opts: EncodeGifOptions): Promise<Blob> {
  const { frames, delayMs, background = '#000000' } = opts
  if (!frames.length) {
    throw new Error('Need at least one frame to encode a GIF')
  }

  const maxSize = opts.maxSize ?? 1080
  let outW = 0
  let outH = 0
  for (const f of frames) {
    outW = Math.max(outW, f.naturalWidth)
    outH = Math.max(outH, f.naturalHeight)
  }
  const scale = Math.min(1, maxSize / Math.max(outW, outH, 1))
  outW = Math.max(1, Math.round(outW * scale))
  outH = Math.max(1, Math.round(outH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not get canvas 2D context')

  const gif = GIFEncoder()
  const delay = Math.max(20, Math.round(delayMs))

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!
    ctx.fillStyle = background
    ctx.fillRect(0, 0, outW, outH)
    const fit = fitContain(frame.naturalWidth, frame.naturalHeight, outW, outH)
    ctx.drawImage(frame.image, fit.x, fit.y, fit.width, fit.height)

    const { data } = ctx.getImageData(0, 0, outW, outH)
    const palette = quantize(data, 256)
    const index = applyPalette(data, palette)
    gif.writeFrame(index, outW, outH, {
      palette,
      delay,
      ...(i === 0 ? { repeat: 0 } : {}),
    })
  }

  gif.finish()
  const bytes = gif.bytes()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy], { type: 'image/gif' })
}
