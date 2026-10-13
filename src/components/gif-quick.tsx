import { useRef, useState } from 'react'
import { fitContain } from '../lib/draw-frame'
import {
  ANIMATION_FORMATS,
  delayFromFps,
  fpsLabel,
  frameDuration,
  MAX_DELAY_MS,
  MIN_DELAY_MS,
  outputSize,
  SPEED_PRESETS,
  speedPresetFor,
  type GifDoc,
} from '../lib/gif-doc'
import { getImage } from '../lib/image-registry'
import { IMAGE_ACCEPT, listFiles } from '../lib/load-image'
import { GIF_BACKGROUNDS } from '../lib/platform-presets'
import { useElementSize } from '../lib/use-element-size'
import { GifScreen } from './gif-screen'
import { Icon } from './icons'

type Props = {
  doc: GifDoc
  activeIndex: number
  playing: boolean
  onTogglePlay: () => void
  onSelect: (index: number) => void
  onReorder: (from: number, to: number) => void
  onAddFiles: (files: File[]) => void
  onPatch: (patch: Partial<GifDoc>) => void
  onHold: (id: string, ms: number) => void
  onFollow: (id: string) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  onStudio: () => void
  onStartOver: () => void
}

const HOLD_STEP_MS = 100
/** Tick marks on each speed tile, denser as it gets faster. */
const TICKS = [2, 4, 7, 12]
/** Room the ring around the current frame takes, each side. */
const RING = 10

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(2).replace(/0$/, '')} s`
}

/** Quick: the loop playing big, its frames in a row, a speed to pick and the current frame's few actions. */
export function GifQuick({
  doc,
  activeIndex,
  playing,
  onTogglePlay,
  onSelect,
  onReorder,
  onAddFiles,
  onPatch,
  onHold,
  onFollow,
  onDuplicate,
  onRemove,
  onStudio,
  onStartOver,
}: Props) {
  const addRef = useRef<HTMLInputElement>(null)
  const dragFrom = useRef<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [playerRef, box] = useElementSize()

  const count = doc.frames.length
  const active = doc.frames[activeIndex] ?? null
  const out = outputSize(doc.frames, doc.maxSize)
  const speed = speedPresetFor(doc.delayMs)
  const formats = ANIMATION_FORMATS.filter((f) => f.primary || f.value === doc.format)

  // The current frame gets half the row when its neighbours show either side, all of it otherwise.
  const ghosts = count > 1 && box.width >= 720
  const current = fitContain(out.width, out.height, Math.max(1, (ghosts ? box.width * 0.5 : box.width) - RING * 2), Math.max(1, box.height - RING * 2))
  const ghost = fitContain(out.width, out.height, Math.max(1, box.width * 0.2), Math.max(1, box.height * 0.78))
  const prev = doc.frames[(activeIndex - 1 + count) % count]
  const next = doc.frames[(activeIndex + 1) % count]

  const pickFiles = (
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
  )

  return (
    <div className="quick">
      {pickFiles}
      <div className="quick-chips">
        <button type="button" className="quick-chip" onClick={() => addRef.current?.click()}>
          <Icon name="plus" size={16} />
          Add frames
          {count ? <span className="quick-chip-count">{count}</span> : null}
        </button>
        <div className="quick-seg" role="group" aria-label="Export as">
          {formats.map((f) => (
            <button
              key={f.value}
              type="button"
              title={f.hint}
              aria-pressed={doc.format === f.value}
              className={doc.format === f.value ? 'on' : ''}
              onClick={() => onPatch({ format: f.value })}
            >
              <strong>{f.label}</strong>
              <span>{f.short}</span>
            </button>
          ))}
        </div>
        <details className="popover">
          <summary className="quick-chip">
            <span className="swatch-dot" style={{ background: doc.background }} />
            Background
          </summary>
          <div className="popover-panel">
            <fieldset className="popover-section">
              <legend>Background</legend>
              <p className="popover-hint">Shows behind frames that don't fill the output.</p>
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
                  <input type="color" value={doc.background} onChange={(e) => onPatch({ background: e.target.value })} />
                </label>
              </div>
            </fieldset>
          </div>
        </details>
        {count ? (
          <button type="button" className="btn btn-quiet quick-start-over" onClick={onStartOver}>
            <Icon name="restart" size={16} />
            Start over
          </button>
        ) : null}
      </div>

      <div className="gif-player" ref={playerRef}>
        {active && box.width > 0 ? (
          <div className="gif-player-row">
            {ghosts && prev ? (
              <div className="gif-player-ghost">
                <GifScreen frame={prev} out={out} background={doc.background} width={ghost.width} height={ghost.height} />
              </div>
            ) : null}
            <div className="gif-player-current" style={{ width: current.width, height: current.height }}>
              <GifScreen
                frame={active}
                out={out}
                background={doc.background}
                width={current.width}
                height={current.height}
                label={`Frame ${activeIndex + 1} of ${count}: ${active.name}`}
              />
              <span className="player-badge is-top">
                {activeIndex + 1} / {count}
              </span>
              <span className="player-badge is-bottom">{seconds(frameDuration(doc, active))}</span>
            </div>
            {ghosts && next ? (
              <div className="gif-player-ghost">
                <GifScreen frame={next} out={out} background={doc.background} width={ghost.width} height={ghost.height} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {active ? (
        <>
          <div className="frame-pill" role="group" aria-label="Frames">
            <button
              type="button"
              className="frame-pill-play"
              aria-label={playing ? 'Pause' : 'Play'}
              title={playing ? 'Pause (space)' : 'Play (space)'}
              disabled={count < 2}
              onClick={onTogglePlay}
            >
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <ol className="frame-pill-list">
              {doc.frames.map((f, i) => (
                <li
                  key={f.id}
                  className={dropAt === i ? 'drop-target' : ''}
                  draggable
                  onDragStart={(e) => {
                    dragFrom.current = i
                    e.dataTransfer.effectAllowed = 'move'
                    // Marks this as a reorder so the editor's file-drop overlay ignores it.
                    e.dataTransfer.setData('text/x-stitcher-frame', String(i))
                  }}
                  onDragOver={(e) => {
                    if (dragFrom.current === null) return
                    e.preventDefault()
                    setDropAt(i)
                  }}
                  onDrop={(e) => {
                    if (dragFrom.current === null) return
                    e.preventDefault()
                    e.stopPropagation()
                    onReorder(dragFrom.current, i)
                    dragFrom.current = null
                    setDropAt(null)
                  }}
                  onDragEnd={() => {
                    dragFrom.current = null
                    setDropAt(null)
                  }}
                >
                  <button
                    type="button"
                    className="frame-pill-thumb"
                    aria-label={`Frame ${i + 1}: ${f.name}, ${seconds(frameDuration(doc, f))}`}
                    aria-current={i === activeIndex ? 'true' : undefined}
                    title="Show this frame. Drag to reorder"
                    style={{ background: doc.background }}
                    onClick={() => onSelect(i)}
                  >
                    <img src={getImage(f.imageId)?.url} alt="" />
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" className="frame-pill-add" aria-label="Add frames" title="Add frames" onClick={() => addRef.current?.click()}>
              <Icon name="plus" size={16} />
            </button>
          </div>

          <div className="quick-dock">
            <section className="quick-panel" aria-labelledby="speed-heading">
              <div className="quick-panel-head">
                <h2 id="speed-heading">Speed</h2>
                <span>
                  {speed
                    ? 'How fast the frames flip. Hold any one frame longer below.'
                    : `${fpsLabel(doc.delayMs)}, set in Studio. Pick one to go back to a preset.`}
                </span>
              </div>
              <div className="quick-tiles">
                {SPEED_PRESETS.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    className="quick-tile"
                    aria-pressed={speed === p.id}
                    onClick={() => onPatch({ delayMs: delayFromFps(p.fps) })}
                  >
                    <span className="quick-tile-art speed-ticks" aria-hidden="true">
                      {Array.from({ length: TICKS[i]! }, (_, t) => (
                        <span key={t} className={t % 2 ? 'is-short' : ''} />
                      ))}
                    </span>
                    <strong>{p.label}</strong>
                    <span>{p.hint}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="quick-toolbar" role="toolbar" aria-label={`Edit frame ${activeIndex + 1}`}>
              <span className="quick-toolbar-name">
                <span className="quick-toolbar-thumb" style={{ background: doc.background }}>
                  <img src={getImage(active.imageId)?.url} alt="" />
                </span>
                Frame {activeIndex + 1}
              </span>
              <span className="quick-toolbar-sep" aria-hidden="true" />
              <span className="quick-hold" role="group" aria-label="Hold this frame">
                <span>Hold</span>
                <button
                  type="button"
                  className="tool-btn"
                  aria-label="Hold this frame for less time"
                  disabled={frameDuration(doc, active) <= MIN_DELAY_MS}
                  onClick={() => onHold(active.id, frameDuration(doc, active) - HOLD_STEP_MS)}
                >
                  <Icon name="minus" size={16} />
                </button>
                <output>{seconds(frameDuration(doc, active))}</output>
                <button
                  type="button"
                  className="tool-btn"
                  aria-label="Hold this frame for longer"
                  disabled={frameDuration(doc, active) >= MAX_DELAY_MS}
                  onClick={() => onHold(active.id, frameDuration(doc, active) + HOLD_STEP_MS)}
                >
                  <Icon name="plus" size={16} />
                </button>
                {active.holdMs !== undefined ? (
                  <button type="button" className="tool-btn quick-link" onClick={() => onFollow(active.id)}>
                    Match the rest
                  </button>
                ) : null}
              </span>
              <span className="quick-toolbar-sep" aria-hidden="true" />
              <button type="button" className="tool-btn" onClick={() => onDuplicate(active.id)}>
                <Icon name="copy" size={16} />
                Duplicate
              </button>
              <button
                type="button"
                className="tool-btn danger"
                aria-label="Remove frame"
                title="Remove frame"
                onClick={() => onRemove(active.id)}
              >
                <Icon name="trash" size={16} />
              </button>
              <span className="quick-toolbar-sep" aria-hidden="true" />
              <button
                type="button"
                className="tool-btn"
                aria-pressed={doc.reverse}
                title="Play the frames from last to first"
                onClick={() => onPatch({ reverse: !doc.reverse })}
              >
                <Icon name="reverse" size={16} />
                Reverse
              </button>
              <span className="quick-toolbar-sep" aria-hidden="true" />
              <button type="button" className="tool-btn" onClick={onStudio}>
                Timeline in Studio
                <Icon name="chevron-right" size={16} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <Icon name="film" size={28} />
          <h2>Turn a series of photos into a loop</h2>
          <p>
            Drop images here, paste them, or pick them below. They play in order as a GIF or a video, all encoded
            on your device.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => addRef.current?.click()}>
            Choose photos
          </button>
        </div>
      )}
    </div>
  )
}
