import JSZip from 'jszip'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'

export type GifFrameSource = {
  image: CanvasImageSource
  naturalWidth: number
  naturalHeight: number
}

export type AnimationExportFormat =
  | 'gif'
  | 'mp4'
  | 'webm'
  | 'png-zip'
  | 'jpeg-zip'

export type EncodeAnimationOptions = {
  frames: GifFrameSource[]
  /** Frame delay in milliseconds (GIF / video) */
  delayMs: number
  /** Max output width/height; frames are fit inside this box */
  maxSize?: number
  /** Background fill behind letterboxed frames */
  background?: string
  /** JPEG quality 0–1 when format is jpeg-zip */
  jpegQuality?: number
  /** Play frames in reverse order */
  reverse?: boolean
  /** GIF loop: -1 once, 0 forever */
  gifRepeat?: number
  /** Extra milliseconds added to the last playback frame */
  holdLastMs?: number
}

export type AnimationExportResult = {
  blob: Blob
  filename: string
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

function prepareOutputSize(
  frames: GifFrameSource[],
  maxSize: number,
): { outW: number; outH: number } {
  let outW = 0
  let outH = 0
  for (const f of frames) {
    outW = Math.max(outW, f.naturalWidth)
    outH = Math.max(outH, f.naturalHeight)
  }
  const scale = Math.min(1, maxSize / Math.max(outW, outH, 1))
  return {
    outW: Math.max(1, Math.round(outW * scale)),
    outH: Math.max(1, Math.round(outH * scale)),
  }
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  frame: GifFrameSource,
  outW: number,
  outH: number,
  background: string,
) {
  ctx.fillStyle = background
  ctx.fillRect(0, 0, outW, outH)
  const fit = fitContain(frame.naturalWidth, frame.naturalHeight, outW, outH)
  ctx.drawImage(frame.image, fit.x, fit.y, fit.width, fit.height)
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error(`Could not encode ${type}`))
      },
      type,
      quality,
    )
  })
}

function playbackFrames(opts: EncodeAnimationOptions): GifFrameSource[] {
  return opts.reverse ? [...opts.frames].reverse() : opts.frames
}

function frameDelayMs(opts: EncodeAnimationOptions, index: number, total: number): number {
  const base = Math.max(20, Math.round(opts.delayMs))
  const extra = index === total - 1 ? Math.max(0, Math.round(opts.holdLastMs ?? 0)) : 0
  return base + extra
}

/** Build an animated GIF blob from canvas-drawn frames (browser-only). */
export async function encodeGifBlob(
  opts: EncodeAnimationOptions,
): Promise<Blob> {
  const frames = playbackFrames(opts)
  const { background = '#000000' } = opts
  if (!frames.length) {
    throw new Error('Need at least one frame to encode a GIF')
  }

  const { outW, outH } = prepareOutputSize(frames, opts.maxSize ?? 1080)
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not get canvas 2D context')

  const gif = GIFEncoder()
  const repeat = opts.gifRepeat ?? 0

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!
    drawFrame(ctx, frame, outW, outH, background)

    const { data } = ctx.getImageData(0, 0, outW, outH)
    const palette = quantize(data, 256)
    const index = applyPalette(data, palette)
    gif.writeFrame(index, outW, outH, {
      palette,
      delay: frameDelayMs(opts, i, frames.length),
      ...(i === 0 ? { repeat } : {}),
    })
  }

  gif.finish()
  const bytes = gif.bytes()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy], { type: 'image/gif' })
}

async function encodeFramesZip(
  opts: EncodeAnimationOptions,
  imageType: 'image/png' | 'image/jpeg',
  ext: 'png' | 'jpg',
): Promise<Blob> {
  const frames = playbackFrames(opts)
  const { background = '#000000' } = opts
  if (!frames.length) {
    throw new Error('Need at least one frame to export')
  }

  const { outW, outH } = prepareOutputSize(frames, opts.maxSize ?? 1080)
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas 2D context')

  const zip = new JSZip()
  const quality = imageType === 'image/jpeg' ? (opts.jpegQuality ?? 0.92) : undefined
  const pad = String(frames.length).length

  for (let i = 0; i < frames.length; i++) {
    drawFrame(ctx, frames[i]!, outW, outH, background)
    const blob = await canvasToBlob(canvas, imageType, quality)
    const n = String(i + 1).padStart(Math.max(2, pad), '0')
    zip.file(`frame-${n}.${ext}`, blob)
  }

  return zip.generateAsync({ type: 'blob' })
}

/** Export frames as GIF, video, or a ZIP of stills. */
export async function exportAnimation(
  format: AnimationExportFormat,
  opts: EncodeAnimationOptions,
): Promise<AnimationExportResult> {
  switch (format) {
    case 'gif':
      return {
        blob: await encodeGifBlob(opts),
        filename: 'stitcher.gif',
      }
    case 'mp4': {
      const { encodeVideoBlob } = await import('./encode-video')
      return {
        blob: await encodeVideoBlob('mp4', opts),
        filename: 'stitcher.mp4',
      }
    }
    case 'webm': {
      const { encodeVideoBlob } = await import('./encode-video')
      return {
        blob: await encodeVideoBlob('webm', opts),
        filename: 'stitcher.webm',
      }
    }
    case 'png-zip':
      return {
        blob: await encodeFramesZip(opts, 'image/png', 'png'),
        filename: 'stitcher-frames-png.zip',
      }
    case 'jpeg-zip':
      return {
        blob: await encodeFramesZip(opts, 'image/jpeg', 'jpg'),
        filename: 'stitcher-frames-jpg.zip',
      }
  }
}
