import { useRef, type CSSProperties, type ReactNode } from 'react'
import { PACE_PRESETS, pacePresetFor, type CollageDoc } from '../lib/collage'
import { IMAGE_ACCEPT, listFiles } from '../lib/load-image'
import { FORMAT_PRESETS } from '../lib/platform-presets'
import type { CollageItem } from '../types'
import { PhotoThumb } from './collage-photos'
import { Icon } from './icons'

type Props = {
  doc: CollageDoc
  /** The preview canvas, drawn by the collage tool. */
  canvas: ReactNode
  /** The photo list, shared with Studio. */
  photos: ReactNode
  selected: CollageItem | null
  timeMs: number
  durationMs: number
  playing: boolean
  onTogglePlay: () => void
  onScrub: (ms: number) => void
  onAddFiles: (files: File[]) => void
  onPatch: (patch: Partial<CollageDoc>) => void
  onMove: (dir: -1 | 1) => void
  onRecut: (id: string) => void
  onRemove: (id: string) => void
  onStudio: () => void
  onStartOver: () => void
}

/** The formats Quick offers; any other one picked in Studio shows alongside them. */
const QUICK_FORMATS = ['story', 'portrait', 'square']
/** How far apart the three cards on each pace tile sit, tighter as it gets faster. */
const SPREAD = [14, 22, 32]
/** Depth on is Studio's default parallax. */
const DEPTH = 0.5

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`
}

/** Quick: the collage playing, its photos, a pace to pick and the selected photo's few actions. */
export function CollageQuick({
  doc,
  canvas,
  photos,
  selected,
  timeMs,
  durationMs,
  playing,
  onTogglePlay,
  onScrub,
  onAddFiles,
  onPatch,
  onMove,
  onRecut,
  onRemove,
  onStudio,
  onStartOver,
}: Props) {
  const addRef = useRef<HTMLInputElement>(null)
  const count = doc.items.length
  const pace = pacePresetFor(doc)
  const index = selected ? doc.items.indexOf(selected) : -1
  const formats = FORMAT_PRESETS.filter(
    (p) => QUICK_FORMATS.includes(p.id) || (p.width === doc.width && p.height === doc.height),
  )

  return (
    <div className="quick">
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
      <div className="quick-chips">
        <button type="button" className="quick-chip" data-guide="add" onClick={() => addRef.current?.click()}>
          <Icon name="plus" size={16} />
          Add photos
          {count ? <span className="quick-chip-count">{count}</span> : null}
        </button>
        <div className="quick-seg" role="group" aria-label="Format">
          {formats.map((p) => {
            const on = p.width === doc.width && p.height === doc.height
            return (
              <button
                key={p.id}
                type="button"
                title={`${p.hint} (${p.width} × ${p.height})`}
                aria-pressed={on}
                className={on ? 'on' : ''}
                onClick={() => onPatch({ width: p.width, height: p.height })}
              >
                <span
                  className="format-shape"
                  aria-hidden="true"
                  style={{ width: (14 * p.width) / Math.max(p.width, p.height), height: (14 * p.height) / Math.max(p.width, p.height) }}
                />
                <strong>{p.label}</strong>
                <span>{p.name}</span>
              </button>
            )
          })}
        </div>
        <label className="quick-chip">
          <span className="swatch-dot" style={{ background: doc.overlay }} />
          Overlay
          <input
            type="color"
            className="quick-chip-color"
            aria-label="Overlay color"
            value={doc.overlay}
            onChange={(e) => onPatch({ overlay: e.target.value })}
          />
        </label>
        {count ? (
          <button type="button" className="btn btn-quiet quick-start-over" onClick={onStartOver}>
            <Icon name="restart" size={16} />
            Start over
          </button>
        ) : null}
      </div>

      {count ? (
        <>
          <div className="collage-quick">
            <div className="collage-quick-player">
              <div className="collage-stage" data-guide="player">
                {canvas}
              </div>
              <div className="frame-pill collage-transport" role="toolbar" aria-label="Playback">
                <button
                  type="button"
                  className="frame-pill-play"
                  aria-label={playing ? 'Pause' : 'Play'}
                  title={playing ? 'Pause (space)' : 'Play (space)'}
                  onClick={onTogglePlay}
                >
                  <Icon name={playing ? 'pause' : 'play'} />
                </button>
                <input
                  type="range"
                  className="collage-scrub"
                  aria-label="Position"
                  min={0}
                  max={durationMs}
                  step={10}
                  value={timeMs}
                  onChange={(e) => onScrub(Number(e.target.value))}
                />
                <span className="playback-count">
                  {seconds(timeMs)} / {seconds(durationMs)}
                </span>
              </div>
            </div>

            <div className="collage-quick-side">
              <section className="quick-card" aria-labelledby="photos-heading" data-guide="photos">
                <div className="quick-card-head">
                  <h2 id="photos-heading">Your photos</h2>
                  <span>In the order they stack. Drag to reorder.</span>
                </div>
                {photos}
              </section>

              <section className="quick-panel" aria-labelledby="pace-heading" data-guide="pace">
                <div className="quick-panel-head">
                  <h2 id="pace-heading">Pace</h2>
                  <span>{pace ? 'How quickly each photo lands.' : 'Timing set in Studio. Pick one to go back to a preset.'}</span>
                </div>
                <div className="quick-tiles is-five">
                  {PACE_PRESETS.map((p, i) => (
                    <button key={p.id} type="button" className="quick-tile" aria-pressed={pace === p.id} onClick={() => onPatch(p.pace)}>
                      <span className="quick-tile-art pace-cards" aria-hidden="true" style={{ '--spread': `${SPREAD[i]}px` } as CSSProperties}>
                        <span />
                        <span />
                        <span />
                      </span>
                      <strong>{p.label}</strong>
                      <span>{p.hint}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="quick-tile"
                    role="switch"
                    aria-checked={doc.parallax > 0}
                    onClick={() => onPatch({ parallax: doc.parallax > 0 ? 0 : DEPTH })}
                  >
                    <span className={`quick-tile-art depth-art ${doc.parallax > 0 ? 'is-on' : ''}`} aria-hidden="true">
                      <span />
                      <span />
                    </span>
                    <strong>Depth {doc.parallax > 0 ? 'on' : 'off'}</strong>
                    <span>Subjects push in</span>
                  </button>
                  <button
                    type="button"
                    className="quick-tile"
                    role="switch"
                    aria-checked={doc.backgrounds === 'fade'}
                    onClick={() => onPatch({ backgrounds: doc.backgrounds === 'fade' ? 'stay' : 'fade' })}
                  >
                    <span className={`quick-tile-art fade-art ${doc.backgrounds === 'fade' ? 'is-on' : ''}`} aria-hidden="true">
                      <span />
                      <span />
                    </span>
                    <strong>Fade out {doc.backgrounds === 'fade' ? 'on' : 'off'}</strong>
                    <span>{doc.backgrounds === 'fade' ? 'Ends on the subjects' : 'Ends on the last photo'}</span>
                  </button>
                </div>
              </section>
            </div>
          </div>

          {selected ? (
            <div className="quick-toolbar" role="toolbar" aria-label={`Edit ${selected.name}`}>
              <span className="quick-toolbar-name">
                <PhotoThumb item={selected} background={doc.overlay} />
                {selected.name}
              </span>
              <span className="quick-toolbar-sep" aria-hidden="true" />
              <button type="button" className="tool-btn" disabled={index <= 0} onClick={() => onMove(-1)}>
                <Icon name="chevron-left" size={16} />
                Earlier
              </button>
              <button type="button" className="tool-btn" disabled={index >= count - 1} onClick={() => onMove(1)}>
                Later
                <Icon name="chevron-right" size={16} />
              </button>
              <span className="quick-toolbar-sep" aria-hidden="true" />
              <button
                type="button"
                className="tool-btn"
                disabled={!selected.cutoutId && !selected.failed}
                onClick={() => onRecut(selected.id)}
              >
                <Icon name="cutout" size={16} />
                {selected.failed ? 'Try the cutout again' : 'Redo cutout'}
              </button>
              <button
                type="button"
                className="tool-btn danger"
                aria-label="Remove photo"
                title="Remove photo"
                onClick={() => onRemove(selected.id)}
              >
                <Icon name="trash" size={16} />
              </button>
              <span className="quick-toolbar-sep" aria-hidden="true" />
              <button type="button" className="tool-btn" onClick={onStudio}>
                Fine-tune timing in Studio
                <Icon name="chevron-right" size={16} />
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
