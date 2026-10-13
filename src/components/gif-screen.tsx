import { useEffect, useRef } from 'react'
import { drawFrame } from '../lib/draw-frame'
import { getImage } from '../lib/image-registry'
import type { GifFrame } from '../types'

type Props = {
  frame: GifFrame
  /** The export's size; the frame is letterboxed into it exactly as the encoders do. */
  out: { width: number; height: number }
  background: string
  /** How big it's shown, in CSS pixels. */
  width: number
  height: number
  label?: string
}

/** One frame as it will look in the export, bars and all, drawn at the size it's shown. */
export function GifScreen({ frame, out, background, width, height, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const scale = Math.min(1, (width * (window.devicePixelRatio || 1)) / out.width)
  const pxW = Math.max(1, Math.round(out.width * scale))
  const pxH = Math.max(1, Math.round(out.height * scale))

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    const image = getImage(frame.imageId)?.image
    if (!ctx || !image) return
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.imageSmoothingQuality = 'high'
    drawFrame(ctx, { image, naturalWidth: frame.naturalWidth, naturalHeight: frame.naturalHeight }, out.width, out.height, background)
  }, [frame, out.width, out.height, background, scale, pxW, pxH])

  return (
    <canvas
      ref={ref}
      className="gif-screen"
      width={pxW}
      height={pxH}
      style={{ width, height }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
