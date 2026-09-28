import type { CarouselDoc, Layer } from '../types'

export function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer) {
  if (!layer.image) return
  ctx.save()
  ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2)
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180)
  if (layer.flipX) ctx.scale(-1, 1)
  ctx.drawImage(layer.image, -layer.width / 2, -layer.height / 2, layer.width, layer.height)
  ctx.restore()
}

/**
 * Rasterize one slide. Layers are drawn straight from their source images, so output quality
 * doesn't depend on the editor's zoom. `fallbackBackground` fills transparent docs (JPEG export).
 */
export function renderSlide(
  doc: CarouselDoc,
  index: number,
  scale = 1,
  fallbackBackground?: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(doc.slideW * scale))
  canvas.height = Math.max(1, Math.round(doc.slideH * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const fill = doc.background ?? fallbackBackground
  if (fill) {
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  ctx.imageSmoothingQuality = 'high'
  ctx.scale(canvas.width / doc.slideW, canvas.height / doc.slideH)
  ctx.translate(-index * doc.slideW, 0)
  for (const layer of doc.layers) drawLayer(ctx, layer)
  return canvas
}
