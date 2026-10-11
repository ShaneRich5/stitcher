import { useRef } from 'react'
import type { CollageDoc } from '../lib/collage'
import type { VideoExportFormat } from '../lib/encode-video'
import { imageFiles } from '../lib/load-image'
import { FORMAT_PRESETS, GIF_BACKGROUNDS } from '../lib/platform-presets'
import { Icon } from './icons'

/**
 * `bar` is the desktop control bar, which keeps timing and overlay in a popover. The phone dock
 * splits the same controls across its two tabs instead.
 */
type Section = 'bar' | 'timing' | 'export'

type Props = {
  doc: CollageDoc
  section?: Section
  onPatch: (patch: Partial<CollageDoc>) => void
  onAddFiles: (files: File[]) => void
}

const VIDEO_FORMATS: { value: VideoExportFormat; label: string; hint: string }[] = [
  { value: 'mp4', label: 'MP4', hint: 'H.264 video — best for Reels and Stories' },
  { value: 'webm', label: 'WebM', hint: 'Web video; less common on social' },
]

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms % 100 ? 2 : 1)}s`
}

export function CollageControls({ doc, section = 'bar', onPatch, onAddFiles }: Props) {
  const addRef = useRef<HTMLInputElement>(null)

  const formatGroup = (
    <div className="control-group" role="group" aria-label="Format">
      <span className="control-label">Format</span>
      <div className="segmented">
        {FORMAT_PRESETS.map((p) => {
          const on = doc.width === p.width && doc.height === p.height
          return (
            <button
              key={p.id}
              type="button"
              className={`seg-btn ${on ? 'on' : ''}`}
              aria-pressed={on}
              title={`${p.hint} (${p.width} × ${p.height})`}
              onClick={() => onPatch({ width: p.width, height: p.height })}
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )

  const exportGroup = (
    <div className="control-group" role="group" aria-label="Export format">
      <span className="control-label">Export</span>
      <div className="segmented">
        {VIDEO_FORMATS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`seg-btn ${doc.format === f.value ? 'on' : ''}`}
            aria-pressed={doc.format === f.value}
            title={f.hint}
            onClick={() => onPatch({ format: f.value })}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )

  const timingFields = (
    <>
      <label className="range-field" title="Time from one subject appearing to the next">
        <span>Per photo</span>
        <input
          type="range"
          min={500}
          max={4000}
          step={50}
          value={doc.stepMs}
          onChange={(e) => onPatch({ stepMs: Number(e.target.value) })}
        />
        <output>{seconds(doc.stepMs)}</output>
      </label>
      <label className="range-field" title="How long after its subject a photo's background fades in">
        <span>Background in</span>
        <input
          type="range"
          min={0}
          max={3000}
          step={50}
          value={doc.backgroundDelayMs}
          onChange={(e) => onPatch({ backgroundDelayMs: Number(e.target.value) })}
        />
        <output>{seconds(doc.backgroundDelayMs)}</output>
      </label>
      <label className="range-field" title="Length of each fade, for subjects and backgrounds">
        <span>Fade</span>
        <input
          type="range"
          min={0}
          max={1500}
          step={50}
          value={doc.fadeMs}
          onChange={(e) => onPatch({ fadeMs: Number(e.target.value) })}
        />
        <output>{seconds(doc.fadeMs)}</output>
      </label>
      <label className="range-field" title="Extra time on the finished stack">
        <span>End hold</span>
        <input
          type="range"
          min={0}
          max={5000}
          step={100}
          value={doc.holdEndMs}
          onChange={(e) => onPatch({ holdEndMs: Number(e.target.value) })}
        />
        <output>{seconds(doc.holdEndMs)}</output>
      </label>
    </>
  )

  const motionField = (
    <label className="range-field" title="Each subject pushes in ahead of its background, for a sense of depth">
      <span>Parallax</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={doc.parallax}
        onChange={(e) => onPatch({ parallax: Number(e.target.value) })}
      />
      <output>{doc.parallax > 0 ? `${Math.round(doc.parallax * 100)}%` : 'Off'}</output>
    </label>
  )

  const overlayFields = (
    <>
      <div className="swatches">
        {GIF_BACKGROUNDS.map((s) => (
          <button
            key={s.label}
            type="button"
            aria-label={s.label}
            title={s.label}
            aria-pressed={doc.overlay === s.value}
            className={`swatch ${doc.overlay === s.value ? 'on' : ''}`}
            style={{ background: s.value }}
            onClick={() => onPatch({ overlay: s.value })}
          />
        ))}
        <label className="swatch swatch-custom" title="Custom color">
          <span className="visually-hidden">Custom color</span>
          <input type="color" value={doc.overlay} onChange={(e) => onPatch({ overlay: e.target.value })} />
        </label>
      </div>
      <label className="range-field" title="How strongly the overlay covers the backgrounds">
        <span>Dim</span>
        <input
          type="range"
          min={0}
          max={0.8}
          step={0.05}
          value={doc.dim}
          onChange={(e) => onPatch({ dim: Number(e.target.value) })}
        />
        <output>{Math.round(doc.dim * 100)}%</output>
      </label>
    </>
  )

  const addImages = (
    <>
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
        Add photos
      </button>
    </>
  )

  if (section === 'timing') {
    return (
      <div className="carousel-controls is-stacked">
        <div className="control-fields">{timingFields}</div>
        <div className="control-fields">
          <span className="control-label">Motion</span>
          {motionField}
        </div>
        <div className="control-fields">
          <span className="control-label">Overlay</span>
          {overlayFields}
        </div>
      </div>
    )
  }

  if (section === 'export') {
    return (
      <div className="carousel-controls is-stacked">
        {formatGroup}
        {exportGroup}
        <div className="control-actions">{addImages}</div>
      </div>
    )
  }

  return (
    <div className="carousel-controls">
      {formatGroup}
      {exportGroup}

      <div className="control-actions">
        {addImages}

        <details className="popover">
          <summary className="btn btn-outline">
            <span className="swatch-dot" style={{ background: doc.overlay }} />
            Style
          </summary>
          <div className="popover-panel">
            <fieldset className="popover-section">
              <legend>Timing</legend>
              {timingFields}
            </fieldset>

            <fieldset className="popover-section">
              <legend>Motion</legend>
              {motionField}
            </fieldset>

            <fieldset className="popover-section">
              <legend>Overlay</legend>
              <p className="popover-hint">Shows before the first photo, and dims the backgrounds.</p>
              {overlayFields}
            </fieldset>
          </div>
        </details>
      </div>
    </div>
  )
}
