import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
} from 'mediabunny'
import type { EncodeAnimationOptions, GifFrameSource } from './encode-gif'

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

/** Encode discrete image frames to MP4 (H.264) or WebM via WebCodecs. */
export async function encodeVideoBlob(
  format: VideoExportFormat,
  opts: EncodeAnimationOptions,
): Promise<Blob> {
  const frames = opts.reverse ? [...opts.frames].reverse() : opts.frames
  const { delayMs, background = '#000000' } = opts
  if (!frames.length) {
    throw new Error('Need at least one frame to encode video')
  }
  if (!canEncodeVideoInBrowser()) {
    throw new Error('Video encoding needs a browser with WebCodecs (Chrome, Edge, or Safari)')
  }

  const { outW, outH } = prepareEvenOutputSize(frames, opts.maxSize ?? 1080)
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not get canvas 2D context')

  const baseDuration = Math.max(0.05, delayMs / 1000)
  const holdExtra = Math.max(0, (opts.holdLastMs ?? 0) / 1000)
  const lastDuration = baseDuration + holdExtra
  const avgDuration =
    frames.length === 1
      ? lastDuration
      : ((frames.length - 1) * baseDuration + lastDuration) / frames.length
  const frameRate = 1 / Math.max(0.05, avgDuration)

  const outputFormat =
    format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat()
  const target = new BufferTarget()
  const output = new Output({
    format: outputFormat,
    target,
  })

  const videoCodec = await getFirstEncodableVideoCodec(
    output.format.getSupportedVideoCodecs(),
    { width: outW, height: outH },
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

  let timestamp = 0
  for (let i = 0; i < frames.length; i++) {
    drawFrame(ctx, frames[i]!, outW, outH, background)
    const duration = i === frames.length - 1 ? lastDuration : baseDuration
    await canvasSource.add(timestamp, duration, {
      keyFrame: i === 0 || i % Math.max(1, Math.round(frameRate * 2)) === 0,
    })
    timestamp += duration
  }

  canvasSource.close()
  await output.finalize()

  const buffer = target.buffer
  if (!buffer) throw new Error('Video encoding produced an empty file')

  const mime = format === 'mp4' ? 'video/mp4' : 'video/webm'
  return new Blob([buffer], { type: mime })
}
