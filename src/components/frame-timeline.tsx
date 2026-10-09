import { useEffect, useRef, useState } from 'react'
import {
  frameDuration,
  frameStarts,
  lastPlayedIndex,
  loopDurationMs,
  MAX_DELAY_MS,
  MIN_DELAY_MS,
  playbackDurations,
  type GifDoc,
} from '../lib/gif-doc'
import { getImage } from '../lib/image-registry'
import { imageFiles } from '../lib/load-image'
import { Icon } from './icons'

type Props = {
  doc: GifDoc
  activeIndex: number
  playing: boolean
  onSelect: (index: number) => void
  onAddFiles: (files: File[]) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onReorder: (from: number, to: number) => void
  onDuration: (id: string, ms: number) => void
  onResetDuration: (id: string) => void
  onApplyToAll: (ms: number) => void
}

const STEP_MS = 100

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * The advanced view: every frame is as wide as it is long, so timing is visible instead of
 * being a number. The strip view stays the default.
 */
export function FrameTimeline({
  doc,
  activeIndex,
  playing,
  onSelect,
  onAddFiles,
  onRemove,
  onDuplicate,
  onReorder,
  onDuration,
  onResetDuration,
  onApplyToAll,
}: Props) {
  const addRef = useRef<HTMLInputElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const dragFrom = useRef<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  const durations = playbackDurations(doc)
  const starts = frameStarts(doc)
  const total = Math.max(1, loopDurationMs(doc))
  const lastPlayed = lastPlayedIndex(doc)
  const active = doc.frames[activeIndex] ?? null
  const activeOwn = active ? frameDuration(doc, active) : doc.delayMs

  // Sweep the playhead across the frame being shown: jump to its start, then run to its end over
  // exactly as long as that frame holds. Paused, it just parks at the start.
  useEffect(() => {
    const el = playheadRef.current
    if (!el || !doc.frames.length) return
    const start = starts[activeIndex] ?? 0
    const span = durations[activeIndex] ?? doc.delayMs
    el.style.transition = 'none'
    el.style.left = `${(start / total) * 100}%`
    if (!playing) return
    void el.offsetWidth // commit the jump before the sweep starts
    el.style.transition = `left ${span}ms linear`
    el.style.left = `${((start + span) / total) * 100}%`
  }, [doc, activeIndex, playing, starts, durations, total])

  const finishDrag = () => {
    dragFrom.current = null
    setDropAt(null)
  }

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-head">
        <strong>Timeline</strong>
        <span className="timeline-elapsed">
          {seconds(starts[activeIndex] ?? 0)} <span>/ {seconds(total)}</span>
        </span>

        {active ? (
          <div className="timeline-frame-timing">
            <span className="control-label">Frame {activeIndex + 1}</span>
            <div className="segmented">
              <button
                type="button"
                className="seg-btn seg-icon"
                aria-label="Hold this frame for less time"
                disabled={activeOwn <= MIN_DELAY_MS}
                onClick={() => onDuration(active.id, activeOwn - STEP_MS)}
              >
                <Icon name="minus" size={16} />
              </button>
              <span className="seg-btn seg-readout">{activeOwn}ms</span>
              <button
                type="button"
                className="seg-btn seg-icon"
                aria-label="Hold this frame for longer"
                disabled={activeOwn >= MAX_DELAY_MS}
                onClick={() => onDuration(active.id, activeOwn + STEP_MS)}
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onApplyToAll(activeOwn)}
            >
              Apply to all
            </button>
            {active.holdMs !== undefined ? (
              <button
                type="button"
                className="btn btn-outline"
                title="Follow the shared speed again"
                onClick={() => onResetDuration(active.id)}
              >
                Reset
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {doc.frames.length ? (
        <div className="timeline-track-wrap">
          <ol className="timeline-ruler" aria-hidden="true">
            {doc.frames.map((f, i) => (
              <li key={f.id} style={{ flexGrow: durations[i] }}>
                {seconds(starts[i] ?? 0)}
              </li>
            ))}
            <li className="timeline-ruler-end">{seconds(total)}</li>
          </ol>

          <ol className="timeline-track">
            {doc.frames.map((f, i) => {
              const ms = durations[i] ?? doc.delayMs
              return (
                <li
                  key={f.id}
                  className={`timeline-block ${i === activeIndex ? 'active' : ''} ${
                    dropAt === i ? 'drop-target' : ''
                  }`}
                  style={{ flexGrow: ms }}
                  draggable
                  onDragStart={(e) => {
                    dragFrom.current = i
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/x-stitcher-frame', String(i))
                  }}
                  onDragOver={(e) => {
                    if (dragFrom.current === null) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDropAt(i)
                  }}
                  onDrop={(e) => {
                    if (dragFrom.current === null) return
                    e.preventDefault()
                    e.stopPropagation()
                    onReorder(dragFrom.current, i)
                    finishDrag()
                  }}
                  onDragEnd={finishDrag}
                >
                  <button
                    type="button"
                    className="timeline-block-btn"
                    aria-label={`Frame ${i + 1}: ${f.name}, ${ms} milliseconds`}
                    aria-current={i === activeIndex ? 'true' : undefined}
                    onClick={() => onSelect(i)}
                  >
                    <span className="timeline-thumb" style={{ background: doc.background }}>
                      <img src={getImage(f.imageId)?.url} alt="" />
                    </span>
                    <span className="timeline-block-meta">
                      <span className="timeline-block-num">
                        {String(i + 1).padStart(2, '0')}
                        {i === lastPlayed && doc.holdLastMs ? ' · held' : ''}
                      </span>
                      <span
                        className={`timeline-block-ms ${f.holdMs === undefined ? '' : 'is-custom'}`}
                        title={
                          f.holdMs === undefined
                            ? 'Follows the shared speed'
                            : 'This frame has its own timing'
                        }
                      >
                        {ms}ms
                      </span>
                    </span>
                  </button>
                  <div className="frame-thumb-actions">
                    <button
                      type="button"
                      className="slide-thumb-remove"
                      aria-label={`Duplicate frame ${i + 1}`}
                      title="Duplicate frame"
                      onClick={() => onDuplicate(f.id)}
                    >
                      <Icon name="copy" size={12} />
                    </button>
                    <button
                      type="button"
                      className="slide-thumb-remove"
                      aria-label={`Remove frame ${i + 1}`}
                      title="Remove frame"
                      onClick={() => onRemove(f.id)}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                </li>
              )
            })}
            <li className="timeline-add-cell">
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
              <button
                type="button"
                className="slide-add timeline-add"
                aria-label="Add frames"
                title="Add frames"
                onClick={() => addRef.current?.click()}
              >
                <Icon name="plus" />
              </button>
            </li>
          </ol>

          <div ref={playheadRef} className="timeline-playhead" aria-hidden="true">
            <span />
          </div>
        </div>
      ) : (
        <p className="timeline-empty">Add images to build the loop.</p>
      )}
    </section>
  )
}
