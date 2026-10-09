import JSZip from 'jszip'
import type { CarouselDoc } from '../types'
import { renderSlide } from './render-slide'

export type ImageFormat = 'png' | 'jpeg'

export type SlideFile = { blob: Blob; filename: string }

export function toBlob(canvas: HTMLCanvasElement, format: ImageFormat): Promise<Blob> {
  const type = format === 'png' ? 'image/png' : 'image/jpeg'
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Could not encode ${type}`))),
      type,
      format === 'jpeg' ? 0.92 : undefined,
    )
  })
}

function cutCell(
  slide: HTMLCanvasElement,
  col: number,
  row: number,
  cols: number,
  rows: number,
): HTMLCanvasElement {
  const x0 = Math.round((col * slide.width) / cols)
  const x1 = Math.round(((col + 1) * slide.width) / cols)
  const y0 = Math.round((row * slide.height) / rows)
  const y1 = Math.round(((row + 1) * slide.height) / rows)
  const cell = document.createElement('canvas')
  cell.width = x1 - x0
  cell.height = y1 - y0
  cell.getContext('2d')?.drawImage(slide, x0, y0, cell.width, cell.height, 0, 0, cell.width, cell.height)
  return cell
}

/** One file per slide (`slide-01.png`), or per grid cell (`slide-01_r1_c2.png`) when cutting. */
export async function renderSlideFiles(
  doc: CarouselDoc,
  format: ImageFormat,
): Promise<SlideFile[]> {
  const ext = format === 'png' ? 'png' : 'jpg'
  const pad = Math.max(2, String(doc.count).length)
  const cols = Math.max(1, doc.gridCols)
  const rows = Math.max(1, doc.gridRows)
  const files: SlideFile[] = []

  for (let i = 0; i < doc.count; i++) {
    const slide = renderSlide(doc, i, 1, format === 'jpeg' ? '#ffffff' : undefined)
    const name = `slide-${String(i + 1).padStart(pad, '0')}`
    if (cols * rows === 1) {
      files.push({ blob: await toBlob(slide, format), filename: `${name}.${ext}` })
      continue
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = cutCell(slide, c, r, cols, rows)
        files.push({ blob: await toBlob(cell, format), filename: `${name}_r${r + 1}_c${c + 1}.${ext}` })
      }
    }
  }
  return files
}

export async function zipSlideFiles(files: SlideFile[]): Promise<Blob> {
  const zip = new JSZip()
  for (const f of files) zip.file(f.filename, f.blob)
  // PNG/JPEG are already compressed; storing is much faster and barely larger.
  return zip.generateAsync({ type: 'blob', compression: 'STORE' })
}

export function canShareFiles(): boolean {
  try {
    return (
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], 'slide.png', { type: 'image/png' })] })
    )
  } catch {
    return false
  }
}

/** Opens the system share sheet (on phones this includes "Save to Photos"). */
export async function shareSlideFiles(files: SlideFile[]): Promise<void> {
  await navigator.share({
    files: files.map((f) => new File([f.blob], f.filename, { type: f.blob.type })),
  })
}
