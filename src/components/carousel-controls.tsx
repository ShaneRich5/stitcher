import { useRef } from 'react'
import { MAX_SLIDES, QUICK_COUNTS } from '../lib/carousel'
import type { ImageFormat } from '../lib/export-carousel'
import { imageFiles } from '../lib/load-image'
import { BACKGROUND_SWATCHES, FORMAT_PRESETS } from '../lib/platform-presets'
import type { CarouselDoc } from '../types'
import { Icon } from './icons'

type Props = {
  doc: CarouselDoc
  exportFormat: ImageFormat
  onCount: (count: number) => void
  onFormat: (width: number, height: number) => void
  onBackground: (color: string | null) => void
  onGrid: (cols: number, rows: number) => void
  onExportFormat: (format: ImageFormat) => void
  onSplitFile: (file: File) => void
  onAddFiles: (files: File[]) => void
}

const GRID_OPTIONS = [1, 2, 3, 4]

/** Whole-carousel controls: these change every slide at once. */
export function CarouselControls({
  doc,
  exportFormat,
  onCount,
  onFormat,
  onBackground,
  onGrid,
  onExportFormat,
  onSplitFile,
  onAddFiles,
}: Props) {
  const splitRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLInputElement>(null)
  const counts = QUICK_COUNTS.includes(doc.count)
    ? QUICK_COUNTS
    : [...QUICK_COUNTS, doc.count].sort((a, b) => a - b)

  return (
    <div className="carousel-controls">
      <div className="control-group" role="group" aria-label="Number of slides">
        <span className="control-label">Slides</span>
        <div className="segmented">
          <button
            type="button"
            className="seg-btn seg-icon"
            aria-label="One fewer slide"
            disabled={doc.count <= 1}
            onClick={() => onCount(doc.count - 1)}
          >
            <Icon name="minus" size={16} />
          </button>
          {counts.map((n) => (
            <button
              key={n}
              type="button"
              className={`seg-btn seg-num ${n === doc.count ? 'on' : ''}`}
              aria-pressed={n === doc.count}
              onClick={() => onCount(n)}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className="seg-btn seg-icon"
            aria-label="One more slide"
            disabled={doc.count >= MAX_SLIDES}
            onClick={() => onCount(doc.count + 1)}
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
      </div>

      <div className="control-group" role="group" aria-label="Slide format">
        <span className="control-label">Format</span>
        <div className="segmented">
          {FORMAT_PRESETS.map((p) => {
            const on = p.width === doc.slideW && p.height === doc.slideH
            return (
              <button
                key={p.id}
                type="button"
                title={p.hint}
                className={`seg-btn ${on ? 'on' : ''}`}
                aria-pressed={on}
                onClick={() => onFormat(p.width, p.height)}
              >
                <span
                  className="format-shape"
                  style={{ width: Math.round((14 * p.width) / Math.max(p.width, p.height)), height: Math.round((14 * p.height) / Math.max(p.width, p.height)) }}
                />
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="control-actions">
        <input
          ref={splitRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          tabIndex={-1}
          onChange={(e) => {
            const [file] = imageFiles(e.target.files)
            if (file) onSplitFile(file)
            e.target.value = ''
          }}
        />
        <button type="button" className="btn btn-outline" onClick={() => splitRef.current?.click()}>
          <Icon name="scissors" />
          Split a photo
        </button>
        <input
          ref={addRef}
          type="file"
          accept="image/*"
          multiple
          className="visually-hidden"
          tabIndex={-1}
          onChange={(e) => {
            const files = imageFiles(e.target.files)
            if (files.length) onAddFiles(files)
            e.target.value = ''
          }}
        />
        <button type="button" className="btn btn-outline" onClick={() => addRef.current?.click()}>
          <Icon name="image" />
          Add images
        </button>

        <details className="popover">
          <summary className="btn btn-outline">
            <span
              className={`swatch-dot ${doc.background ? '' : 'is-transparent'}`}
              style={{ background: doc.background ?? undefined }}
            />
            Style
          </summary>
          <div className="popover-panel">
            <fieldset className="popover-section">
              <legend>Background</legend>
              <div className="swatches">
                {BACKGROUND_SWATCHES.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    aria-label={s.label}
                    title={s.label}
                    aria-pressed={doc.background === s.value}
                    className={`swatch ${s.value ? '' : 'is-transparent'} ${doc.background === s.value ? 'on' : ''}`}
                    style={{ background: s.value ?? undefined }}
                    onClick={() => onBackground(s.value)}
                  />
                ))}
                <label className="swatch swatch-custom" title="Custom color">
                  <span className="visually-hidden">Custom color</span>
                  <input
                    type="color"
                    value={doc.background ?? '#ffffff'}
                    onChange={(e) => onBackground(e.target.value)}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="popover-section">
              <legend>Cut each slide into a grid</legend>
              <p className="popover-hint">For profile-grid posts. 1 × 1 exports whole slides.</p>
              <div className="grid-picker">
                <label>
                  Columns
                  <select value={doc.gridCols} onChange={(e) => onGrid(Number(e.target.value), doc.gridRows)}>
                    {GRID_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <span aria-hidden="true">×</span>
                <label>
                  Rows
                  <select value={doc.gridRows} onChange={(e) => onGrid(doc.gridCols, Number(e.target.value))}>
                    {GRID_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="popover-section">
              <legend>Export as</legend>
              <div className="segmented">
                <button
                  type="button"
                  className={`seg-btn ${exportFormat === 'png' ? 'on' : ''}`}
                  aria-pressed={exportFormat === 'png'}
                  onClick={() => onExportFormat('png')}
                >
                  PNG · best quality
                </button>
                <button
                  type="button"
                  className={`seg-btn ${exportFormat === 'jpeg' ? 'on' : ''}`}
                  aria-pressed={exportFormat === 'jpeg'}
                  onClick={() => onExportFormat('jpeg')}
                >
                  JPEG · smaller
                </button>
              </div>
            </fieldset>
          </div>
        </details>
      </div>
    </div>
  )
}
