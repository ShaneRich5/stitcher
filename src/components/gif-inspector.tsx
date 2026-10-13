import {
  ANIMATION_FORMATS,
  clampDelay,
  delayFromFps,
  FPS_PRESETS,
  fpsFromDelay,
  fpsLabel,
  frameDuration,
  letterboxedFrames,
  MAX_DELAY_MS,
  MIN_DELAY_MS,
  outputSize,
  softFrames,
  type GifDoc,
} from '../lib/gif-doc'
import { getImage } from '../lib/image-registry'
import { GIF_BACKGROUNDS, OUTPUT_SIZE_PRESETS } from '../lib/platform-presets'
import type { GifFrame } from '../types'
import { Icon } from './icons'
import { InspectorSections, SoonNote } from './inspector-sections'

type Props = {
  variant: 'panel' | 'sheet'
  doc: GifDoc
  activeIndex: number
  onPatch: (patch: Partial<GifDoc>) => void
  onHold: (id: string, ms: number) => void
  onFollow: (id: string) => void
  onApplyToAll: (ms: number) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  /** Show frame `index` on the canvas, from a check. */
  onShow: (index: number) => void
}

/** "sunset.jpg" for one frame, "3 frames" for more. */
function naming(frames: GifFrame[]): { who: string; one: boolean } {
  return frames.length === 1 ? { who: frames[0]!.name, one: true } : { who: `${frames.length} frames`, one: false }
}

/** Studio's inspector for the GIF tool: the current frame's hold, then the loop's playback and output. */
export function GifInspector({ variant, doc, activeIndex, onPatch, onHold, onFollow, onApplyToAll, onDuplicate, onRemove, onShow }: Props) {
  const active = doc.frames[activeIndex] ?? null
  const out = outputSize(doc.frames, doc.maxSize)
  const activeFps = fpsFromDelay(doc.delayMs)
  const boxed = letterboxedFrames(doc)
  const soft = softFrames(doc)
  const show = (frames: GifFrame[]) => onShow(doc.frames.indexOf(frames[0]!))

  const head = active ? (
    <>
      <span className="layer-thumb" style={{ background: doc.background }}>
        <img src={getImage(active.imageId)?.url} alt="" />
      </span>
      <span className="inspector-title">
        <strong>Frame {activeIndex + 1}</strong>
        <span>
          {active.name} · {active.naturalWidth.toLocaleString()} × {active.naturalHeight.toLocaleString()}
        </span>
      </span>
      <button type="button" className="icon-btn" aria-label="Duplicate frame" title="Duplicate frame" onClick={() => onDuplicate(active.id)}>
        <Icon name="copy" size={16} />
      </button>
      <button type="button" className="icon-btn" aria-label="Remove frame" title="Remove frame (Delete)" onClick={() => onRemove(active.id)}>
        <Icon name="trash" size={16} />
      </button>
    </>
  ) : (
    <span className="inspector-title">
      <strong>GIF</strong>
      <span>No frames yet</span>
    </span>
  )

  const own = active ? frameDuration(doc, active) : doc.delayMs
  const frame = active ? (
    <div className="inspector-fields">
      <label className="range-field">
        <span>Hold</span>
        <input
          type="range"
          min={MIN_DELAY_MS}
          max={MAX_DELAY_MS}
          step={10}
          value={own}
          onChange={(e) => onHold(active.id, Number(e.target.value))}
        />
        <output>{own}ms</output>
      </label>
      {active.holdMs !== undefined ? (
        <p className="check-card is-accent">
          <Icon name="film" size={16} />
          <span>Held for its own time, not the loop's speed.</span>
        </p>
      ) : (
        <p className="inspector-note">Follows the loop's speed. Move the slider to hold just this frame.</p>
      )}
      <div className="inspector-buttons is-two">
        <button type="button" className="btn btn-outline" disabled={active.holdMs === undefined} onClick={() => onFollow(active.id)}>
          Match the rest
        </button>
        <button type="button" className="btn btn-outline" title="Make this the loop's speed, for every frame" onClick={() => onApplyToAll(own)}>
          Apply to all
        </button>
      </div>
    </div>
  ) : (
    <div className="inspector-fields">
      <p className="inspector-note">Add frames to time them.</p>
    </div>
  )

  const playback = (
    <div className="inspector-fields">
      <div className="segmented inspector-fit" role="group" aria-label="Frames per second">
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
      <label className="range-field">
        <span>Speed</span>
        <input
          type="range"
          min={MIN_DELAY_MS}
          max={MAX_DELAY_MS}
          step={10}
          value={doc.delayMs}
          onChange={(e) => onPatch({ delayMs: clampDelay(Number(e.target.value)) })}
        />
        <output>{fpsLabel(doc.delayMs)}</output>
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
        <input type="checkbox" checked={doc.reverse} onChange={(e) => onPatch({ reverse: e.target.checked })} />
        <span>Play in reverse</span>
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
    </div>
  )

  const output = (
    <div className="inspector-fields">
      <div className="segmented inspector-fit" role="group" aria-label="Output size">
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
      <label className="range-field">
        <span>Long edge</span>
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
      <div className="inspector-row">
        <span>Bars</span>
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
            <span className="visually-hidden">Custom bar color</span>
            <input type="color" value={doc.background} onChange={(e) => onPatch({ background: e.target.value })} />
          </label>
        </div>
      </div>
      <p className="inspector-note">The bars show behind frames that don't fill the output.</p>
      <label className="inspector-row">
        <span>Format</span>
        <select
          className="inspector-select"
          value={doc.format}
          onChange={(e) => onPatch({ format: e.target.value as GifDoc['format'] })}
        >
          {ANIMATION_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label} · {f.short}
            </option>
          ))}
        </select>
      </label>
    </div>
  )

  const boxedName = naming(boxed)
  const softName = naming(soft)
  const checks = (
    <div className="inspector-fields">
      {boxed.length ? (
        <p className="check-card is-warn">
          <Icon name="alert" size={16} />
          <span>
            <strong>{boxedName.who}</strong> {boxedName.one ? 'is' : 'are'} a different shape from the {out.width} × {out.height}{' '}
            output, so {boxedName.one ? 'it plays' : 'they play'} with bars.
          </span>
          <button type="button" className="btn btn-outline" onClick={() => show(boxed)}>
            Show
          </button>
        </p>
      ) : null}
      {soft.length ? (
        <p className="check-card is-warn">
          <Icon name="alert" size={16} />
          <span>
            <strong>{softName.who}</strong> {softName.one ? 'is' : 'are'} smaller than the rest and will look soft at {out.width} ×{' '}
            {out.height}.
          </span>
          <button type="button" className="btn btn-outline" onClick={() => show(soft)}>
            Show
          </button>
        </p>
      ) : null}
      {doc.frames.length > 0 && !soft.length && !boxed.length ? (
        <p className="check-card is-ok">
          <Icon name="check" size={16} />
          <span>
            Every frame is sharp at {out.width} × {out.height}
          </span>
        </p>
      ) : null}
      {!doc.frames.length ? <p className="inspector-note">Nothing to check yet.</p> : null}
    </div>
  )

  const warnings = (boxed.length ? 1 : 0) + (soft.length ? 1 : 0)

  return (
    <InspectorSections
      variant={variant}
      label={active ? `Edit frame ${activeIndex + 1}` : 'GIF settings'}
      head={head}
      storageKey="stitcher.gif.sections"
      defaultOpen={['frame', 'playback', 'output', 'checks']}
      sections={[
        { id: 'frame', label: 'This frame', body: frame },
        { id: 'playback', label: 'Playback', body: playback },
        { id: 'output', label: 'Output', body: output },
        { id: 'look', label: 'Film look', body: <SoonNote>The carousel's looks, with grain that moves from frame to frame.</SoonNote> },
        { id: 'checks', label: 'Checks', body: checks, badge: warnings },
      ]}
    />
  )
}
