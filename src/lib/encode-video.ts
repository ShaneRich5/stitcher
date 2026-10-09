import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
} from 'mediabunny'
import { playbackSteps, type EncodeAnimationOptions, type GifFrameSource } from './encode-gif'

export type VideoExportFormat = 'mp4' | 'webm'

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

function prepareEvenOutputSize(
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
  outW = Math.max(2, Math.round(outW * scale))
  outH = Math.max(2, Math.round(outH * scale))
  // H.264 encoders typically require even dimensions
  outW -= outW % 2
  outH -= outH % 2
  return { outW: Math.max(2, outW), outH: Math.max(2, outH) }
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

export function canEncodeVideoInBrowser(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
}

type VideoSink = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  /** Encode what's on the canvas now. Times are in seconds. */
  add: (timestamp: number, duration: number, keyFrame: boolean) => Promise<void>
  finish: () => Promise<Blob>
}

/** A canvas wired to a Mediabunny video track: draw on it, then `add` each frame. */
async function openVideo(
  format: VideoExportFormat,
  width: number,
  height: number,
  frameRate: number,
  contextOptions?: CanvasRenderingContext2DSettings,
): Promise<VideoSink> {
  if (!canEncodeVideoInBrowser()) {
    throw new Error('Video encoding needs a browser with WebCodecs (Chrome, Edge, or Safari)')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', contextOptions)
  if (!ctx) throw new Error('Could not get canvas 2D context')

  const outputFormat =
    format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat()
  const target = new BufferTarget()
  const output = new Output({
    format: outputFormat,
    target,
  })

  const videoCodec = await getFirstEncodableVideoCodec(
    output.format.getSupportedVideoCodecs(),
    { width, height },
  )
  if (!videoCodec) {
    throw new Error(
      format === 'mp4'
        ? 'This browser cannot encode MP4/H.264. Try WebM, or use Chrome/Edge/Safari.'
        : 'This browser cannot encode WebM. Try MP4, or use Chrome/Edge/Firefox.',
    )
  }

  const canvasSource = new CanvasSource(canvas, {
    codec: videoCodec,
    quality: QUALITY_HIGH,
  })
  output.addVideoTrack(canvasSource, { frameRate })

  await output.start()

  return {
    canvas,
    ctx,
    add: (timestamp, duration, keyFrame) => canvasSource.add(timestamp, duration, { keyFrame }),
    finish: async () => {
      canvasSource.close()
      await output.finalize()

      const buffer = target.buffer
      if (!buffer) throw new Error('Video encoding produced an empty file')

      const mime = format === 'mp4' ? 'video/mp4' : 'video/webm'
      return new Blob([buffer], { type: mime })
    },
  }
}

/** Encode discrete image frames to MP4 (H.264) or WebM via WebCodecs. */
export async function encodeVideoBlob(
  format: VideoExportFormat,
  opts: EncodeAnimationOptions,
): Promise<Blob> {
  const steps = playbackSteps(opts)
  const frames = steps.map((s) => s.frame)
  const { background = '#000000' } = opts
  if (!frames.length) {
    throw new Error('Need at least one frame to encode video')
  }

  const { outW, outH } = prepareEvenOutputSize(frames, opts.maxSize ?? 1080)

  // Each frame carries its own hold, so the declared rate is the average over the whole loop.
  const durations = steps.map((s) => Math.max(0.05, s.delayMs / 1000))
  const avgDuration = durations.reduce((total, d) => total + d, 0) / durations.length
  const frameRate = 1 / Math.max(0.05, avgDuration)

  const video = await openVideo(format, outW, outH, frameRate, { willReadFrequently: true })

  let timestamp = 0
  for (let i = 0; i < frames.length; i++) {
    drawFrame(video.ctx, frames[i]!, outW, outH, background)
    const duration = durations[i]!
    await video.add(timestamp, duration, i === 0 || i % Math.max(1, Math.round(frameRate * 2)) === 0)
    timestamp += duration
  }

  return video.finish()
}

export type TimelineVideoOptions = {
  /** Size of the coordinate space `draw` paints in; the video rounds it down to even pixels. */
  width: number
  height: number
  durationMs: number
  fps: number
  /** Paint the moment `timeMs` (the context is scaled to `width` × `height`). */
  draw: (ctx: CanvasRenderingContext2D, timeMs: number) => void
  /** Fraction of frames encoded so far, 0–1. */
  onProgress?: (fraction: number) => void
}

/**
 * Encode an animation drawn moment by moment at a constant frame rate. Each frame is drawn and
 * encoded before the next, so a long video never holds more than one frame in memory.
 */
export async function encodeTimelineVideo(
  format: VideoExportFormat,
  opts: TimelineVideoOptions,
): Promise<Blob> {
  const width = Math.max(2, Math.round(opts.width) - (Math.round(opts.width) % 2))
  const height = Math.max(2, Math.round(opts.height) - (Math.round(opts.height) % 2))
  const frameCount = Math.max(1, Math.ceil((opts.durationMs / 1000) * opts.fps))
  const keyEvery = Math.max(1, Math.round(opts.fps * 2))

  const video = await openVideo(format, width, height, opts.fps)
  for (let i = 0; i < frameCount; i++) {
    video.ctx.setTransform(width / opts.width, 0, 0, height / opts.height, 0, 0)
    opts.draw(video.ctx, (i * 1000) / opts.fps)
    await video.add(i / opts.fps, 1 / opts.fps, i % keyEvery === 0)
    opts.onProgress?.((i + 1) / frameCount)
  }
  return video.finish()
}
