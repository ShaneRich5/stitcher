import { useRef } from 'react'
import type { AnimationExportFormat } from '../lib/encode-gif'
import {
  clampDelay,
  delayFromFps,
  FPS_PRESETS,
  fpsFromDelay,
  fpsLabel,
  MAX_DELAY_MS,
  MIN_DELAY_MS,
  type GifDoc,
} from '../lib/gif-doc'
import { imageFiles } from '../lib/load-image'
import { GIF_BACKGROUNDS, OUTPUT_SIZE_PRESETS } from '../lib/platform-presets'
import { Icon } from './icons'

/**
 * `bar` is the desktop control bar, which keeps the extras in a popover. The phone dock splits
 * the same controls across its two tabs instead, since a popover inside the dock is cramped.
 */
type Section = 'bar' | 'loop' | 'export'

type Props = {
  doc: GifDoc
  section?: Section
  onPatch: (patch: Partial<GifDoc>) => void
  onAddFiles: (files: File[]) => void
}

const PRIMARY_FORMATS: { value: AnimationExportFormat; label: string; hint: string }[] = [
  { value: 'mp4', label: 'MP4', hint: 'H.264 video — best for Reels and feed video' },
  { value: 'gif', label: 'GIF', hint: 'Animated .gif — works in Instagram posts' },
]

const MORE_FORMATS: { value: AnimationExportFormat; label: string; hint: string }[] = [
  { value: 'webm', label: 'WebM', hint: 'Web video; less common on social' },
  { value: 'png-zip', label: 'PNG frames', hint: 'Lossless stills, one file per frame' },
  { value: 'jpeg-zip', label: 'JPEG frames', hint: 'Smaller stills for uploading separately' },
]

export function GifControls({ doc, section = 'bar', onPatch, onAddFiles }: Props) {
  const addRef = useRef<HTMLInputElement>(null)
  const activeFps = fpsFromDelay(doc.delayMs)
  const moreFormat = MORE_FORMATS.find((f) => f.value === doc.format)

  const speedGroup = (
    <div className="control-group" role="group" aria-label="Frame rate">
      <span className="control-label">Speed</span>
      <div className="segmented">
        {FPS_PRESETS.map((fps) => {
          const on = Math.abs(activeFps - fps) < 0.05
          return (
            <button
              key={fps}
              type="button"
              className={`seg-btn seg-num ${on ? 'on' : ''}`}
              aria-pressed={on}
              title={`${fps} frames per second`}
              onClick={() => onPatch({ delayMs: delayFromFps(fps) })}
            >
              {fps}
            </button>
          )
        })}
      </div>
      <span className="control-readout">{fpsLabel(doc.delayMs)}</span>
    </div>
  )

  const sizeGroup = (
    <div className="control-group" role="group" aria-label="Output size">
      <span className="control-label">Size</span>
      <div className="segmented">
        {OUTPUT_SIZE_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            className={`seg-btn ${doc.maxSize === n ? 'on' : ''}`}
            aria-pressed={doc.maxSize === n}
            title={`Longest edge ${n} pixels`}
            onClick={() => onPatch({ maxSize: n })}
          >
            {n}p
          </button>
        ))}
      </div>
    </div>
  )

  const formatGroup = (
    <div className="control-group" role="group" aria-label="Export format">
      <span className="control-label">Export</span>
      <div className="segmented">
        {PRIMARY_FORMATS.map((f) => (
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
        {moreFormat ? (
          <span className="seg-btn on" aria-current="true" title={moreFormat.hint}>
            {moreFormat.label}
          </span>
        ) : null}
      </div>
    </div>
  )

  const timingFields = (
    <>
      <label className="range-field">
        <span>Frame</span>
        <input
          type="range"
          min={MIN_DELAY_MS}
          max={MAX_DELAY_MS}
          step={10}
          value={doc.delayMs}
          onChange={(e) => onPatch({ delayMs: clampDelay(Number(e.target.value)) })}
        />
        <output>{doc.delayMs}ms</output>
      </label>
      <label className="range-field">
        <span>Hold last</span>
        <input
          type="range"
          min={0}
          max={3000}
          step={50}
          value={doc.holdLastMs}
          onChange={(e) => onPatch({ holdLastMs: Number(e.target.value) })}
        />
        <output>{doc.holdLastMs}ms</output>
      </label>
      <label className="check-line">
        <input
          type="checkbox"
          checked={doc.reverse}
          onChange={(e) => onPatch({ reverse: e.target.checked })}
        />
        <span>Play frames in reverse</span>
      </label>
      <label className="check-line">
        <input
          type="checkbox"
          checked={doc.loopOnce}
          disabled={doc.format !== 'gif'}
          onChange={(e) => onPatch({ loopOnce: e.target.checked })}
        />
        <span>Play once instead of looping (GIF only)</span>
      </label>
    </>
  )

  const backgroundSwatches = (
    <div className="swatches">
      {GIF_BACKGROUNDS.map((s) => (
        <button
          key={s.label}
          type="button"
          aria-label={s.label}
          title={s.label}
          aria-pressed={doc.background === s.value}
          className={`swatch ${doc.background === s.value ? 'on' : ''}`}
          style={{ background: s.value }}
          onClick={() => onPatch({ background: s.value })}
        />
      ))}
      <label className="swatch swatch-custom" title="Custom color">
        <span className="visually-hidden">Custom color</span>
        <input
          type="color"
          value={doc.background}
          onChange={(e) => onPatch({ background: e.target.value })}
        />
      </label>
    </div>
  )

  const moreFormatsGroup = (
    <div className="segmented">
      {MORE_FORMATS.map((f) => (
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
  )

  const customSize = (
    <label className="range-field">
      <span>Longest edge</span>
      <input
        type="range"
        min={240}
        max={1920}
        step={20}
        value={doc.maxSize}
        onChange={(e) => onPatch({ maxSize: Number(e.target.value) })}
      />
      <output>{doc.maxSize}px</output>
    </label>
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
        Add images
      </button>
    </>
  )

  if (section === 'loop') {
    return (
      <div className="carousel-controls is-stacked">
        {speedGroup}
        <div className="control-fields">{timingFields}</div>
      </div>
    )
  }

  if (section === 'export') {
    return (
      <div className="carousel-controls is-stacked">
        {sizeGroup}
        <div className="control-fields">{customSize}</div>
        {formatGroup}
        {moreFormatsGroup}
        <div className="control-fields">
          <span className="control-label">Background</span>
          {backgroundSwatches}
        </div>
        <div className="control-actions">{addImages}</div>
      </div>
    )
  }

  return (
    <div className="carousel-controls">
      {speedGroup}
      {sizeGroup}
      {formatGroup}

      <div className="control-actions">
        {addImages}

        <details className="popover">
          <summary className="btn btn-outline">
            <span className="swatch-dot" style={{ background: doc.background }} />
            Style
          </summary>
          <div className="popover-panel">
            <fieldset className="popover-section">
              <legend>Background</legend>
              <p className="popover-hint">Shows behind frames that don't fill the output.</p>
              {backgroundSwatches}
            </fieldset>

            <fieldset className="popover-section">
              <legend>Timing</legend>
              {timingFields}
            </fieldset>

            <fieldset className="popover-section">
              <legend>More formats</legend>
              {moreFormatsGroup}
            </fieldset>

            <fieldset className="popover-section">
              <legend>Custom size</legend>
              {customSize}
            </fieldset>
          </div>
        </details>
      </div>
    </div>
  )
}
