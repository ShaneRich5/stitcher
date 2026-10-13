import { useRef } from 'react'
import { MAX_SLIDES, QUICK_COUNTS } from '../lib/carousel'
import type { ImageFormat } from '../lib/export-carousel'
import { DEFAULT_LIGHT_LEAKS, LEAK_COLORS } from '../lib/light-leaks'
import { IMAGE_ACCEPT, listFiles } from '../lib/load-image'
import { BACKGROUND_SWATCHES, FORMAT_PRESETS } from '../lib/platform-presets'
import type { CarouselDoc, LightLeaks } from '../types'
import { Icon } from './icons'

type Props = {
  doc: CarouselDoc
  exportFormat: ImageFormat
  /** 0–1, used when exporting JPEG. */
  jpegQuality: number
  onCount: (count: number) => void
  onFormat: (width: number, height: number) => void
  onBackground: (color: string | null) => void
  onGrid: (cols: number, rows: number) => void
  /** `coalesce` names a slider or picker, so dragging it is one undo step. */
  onLightLeaks: (patch: Partial<LightLeaks>, coalesce?: string) => void
  /** Move the leaks to new places. */
  onShuffleLeaks: () => void
  onExportFormat: (format: ImageFormat) => void
  onJpegQuality: (quality: number) => void
  /** Open the slides in the GIF tool as frames. Left out until there's something to animate. */
  onMakeAnimation?: () => void
  onSplitFile: (file: File) => void
  onAddFiles: (files: File[]) => void
}

const GRID_OPTIONS = [1, 2, 3, 4]

/** Whole-carousel controls: these change every slide at once. */
export function CarouselControls({
  doc,
  exportFormat,
  jpegQuality,
  onCount,
  onFormat,
  onBackground,
  onGrid,
  onLightLeaks,
  onShuffleLeaks,
  onExportFormat,
  onJpegQuality,
  onMakeAnimation,
  onSplitFile,
  onAddFiles,
}: Props) {
  const splitRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLInputElement>(null)
  const counts = QUICK_COUNTS.includes(doc.count)
    ? QUICK_COUNTS
    : [...QUICK_COUNTS, doc.count].sort((a, b) => a - b)
  const leaks = doc.lightLeaks ?? DEFAULT_LIGHT_LEAKS

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
                title={`${p.hint} (${p.width} × ${p.height})`}
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
          accept={IMAGE_ACCEPT}
          className="visually-hidden"
          tabIndex={-1}
          onChange={(e) => {
            const [file] = listFiles(e.target.files)
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
          accept={IMAGE_ACCEPT}
          multiple
          className="visually-hidden"
          tabIndex={-1}
          onChange={(e) => {
            const files = listFiles(e.target.files)
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
              <legend>Light leaks</legend>
              <p className="popover-hint">Light bleeding across the seams, so it carries on as you swipe.</p>
              <label className="range-field">
                <span>Amount</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={leaks.amount}
                  onChange={(e) => onLightLeaks({ amount: Number(e.target.value) }, 'leak-amount')}
                />
                <output>{Math.round(leaks.amount * 100)}%</output>
              </label>
              {leaks.amount > 0 ? (
                <div className="leak-row">
                  <div className="swatches" role="radiogroup" aria-label="Leak color">
                    {LEAK_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        role="radio"
                        aria-label={c.label}
                        title={c.label}
                        aria-checked={leaks.color === c.value}
                        className={`swatch ${leaks.color === c.value ? 'on' : ''}`}
                        style={{ background: c.value }}
                        onClick={() => onLightLeaks({ color: c.value })}
                      />
                    ))}
                    <label className="swatch swatch-custom" title="Custom color">
                      <span className="visually-hidden">Custom leak color</span>
                      <input
                        type="color"
                        value={leaks.color}
                        onChange={(e) => onLightLeaks({ color: e.target.value }, 'leak-color')}
                      />
                    </label>
                  </div>
                  <button type="button" className="btn btn-outline" onClick={onShuffleLeaks}>
                    <Icon name="shuffle" size={16} />
                    Shuffle
                  </button>
                </div>
              ) : null}
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
              {exportFormat === 'jpeg' ? (
                <label className="range-field">
                  <span>Quality</span>
                  <input
                    type="range"
                    min={60}
                    max={100}
                    step={1}
                    value={Math.round(jpegQuality * 100)}
                    onChange={(e) => onJpegQuality(Number(e.target.value) / 100)}
                  />
                  <output>{Math.round(jpegQuality * 100)}</output>
                </label>
              ) : null}
              <button
                type="button"
                className="btn btn-outline"
                disabled={!onMakeAnimation}
                title="Open each slide as a frame in the GIF tool, for a Story or Reel"
                onClick={onMakeAnimation}
              >
                <Icon name="film" size={16} />
                Make a GIF or video
              </button>
            </fieldset>
          </div>
        </details>
      </div>
    </div>
  )
}
