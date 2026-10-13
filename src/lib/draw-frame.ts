import type { GifFrameSource } from './encode-gif'

/** The largest box of the source's shape that fits in `boxW` × `boxH`, centred, in whole pixels. */
export function fitContain(
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

/** Fill the output with `background`, then letterbox the frame inside it. Shared by every encoder. */
export function drawFrame(
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
