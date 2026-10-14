import type { CSSProperties } from 'react'
import { cutoutState, itemSchedule, type CollageDoc } from '../lib/collage'
import { PhotoThumb } from './collage-photos'
import { Icon } from './icons'

type Props = {
  doc: CollageDoc
  timeMs: number
  durationMs: number
  playing: boolean
  selectedId: string | null
  cuttingId: string | null
  onTogglePlay: () => void
  onStep: (dir: -1 | 1) => void
  onSelect: (index: number) => void
  /** Phones show the transport only; the lanes need the width. */
  lanes?: boolean
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`
}

/**
 * Studio's sequence: a lane per photo, showing when its subject fades in, when its photo comes in
 * behind it, and when the next photo covers it, with the end hold and a playhead across them all.
 */
export function CollageSequence({
  doc,
  timeMs,
  durationMs,
  playing,
  selectedId,
  cuttingId,
  onTogglePlay,
  onStep,
  onSelect,
  lanes = true,
}: Props) {
  const total = Math.max(1, durationMs)
  const pct = (ms: number) => `${(Math.max(0, Math.min(total, ms)) / total) * 100}%`
  const schedule = itemSchedule(doc)
  /** The end hold is the stack's; the Instagram style loops instead. */
  const hold = doc.style === 'stack' ? doc.holdEndMs : 0
  const tickStep = total > 12000 ? 2000 : 1000
  const ticks = Array.from({ length: Math.floor(total / tickStep) + 1 }, (_, i) => i * tickStep)
  /** The fade, as a share of a bar `length` ms long, for the bar's ramp. */
  const ramp = (length: number): CSSProperties =>
    ({ '--ramp': `${Math.min(100, (doc.fadeMs / Math.max(1, length)) * 100)}%` }) as CSSProperties

  return (
    <section className="sequence" aria-label="Sequence">
      <div className="sequence-head">
        <div className="sequence-transport" role="toolbar" aria-label="Playback">
          <button type="button" className="icon-btn" aria-label="Previous photo" title="Previous photo (←)" onClick={() => onStep(-1)}>
            <Icon name="chevron-left" size={16} />
          </button>
          <button
            type="button"
            className="sequence-play"
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause (space)' : 'Play (space)'}
            onClick={onTogglePlay}
          >
            <Icon name={playing ? 'pause' : 'play'} size={16} />
          </button>
          <button type="button" className="icon-btn" aria-label="Next photo" title="Next photo (→)" onClick={() => onStep(1)}>
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
        <span className="sequence-time">
          {seconds(timeMs)} <span>/ {seconds(durationMs)}</span>
        </span>
        {lanes ? (
          <span className="sequence-legend">
            <span>
              <span className="legend-swatch is-subject" aria-hidden="true" />
              Subject fades in
            </span>
            <span>
              <span className="legend-swatch is-photo" aria-hidden="true" />
              Its photo behind
            </span>
            {hold > 0 ? (
              <span>
                <span className="legend-swatch is-hold" aria-hidden="true" />
                End hold
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {lanes ? (
        <div className="sequence-body">
          <div className="sequence-ruler" aria-hidden="true">
            {ticks.map((ms) => (
              <span key={ms} style={{ left: pct(ms) }}>
                {ms / 1000} s
              </span>
            ))}
          </div>
          <div className="sequence-lanes">
            {doc.items.map((item, i) => {
              const s = schedule[i]!
              const state = cutoutState(item, cuttingId)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sequence-lane ${item.id === selectedId ? 'on' : ''}`}
                  aria-current={item.id === selectedId ? 'true' : undefined}
                  aria-label={`${item.name}: subject in at ${seconds(s.subjectInMs)}, photo behind at ${seconds(s.backgroundInMs)}`}
                  onClick={() => onSelect(i)}
                >
                  <span className="sequence-lane-name">
                    <PhotoThumb item={item} background={doc.overlay} />
                    <span>{item.name}</span>
                  </span>
                  <span className="sequence-lane-track">
                    <span
                      className={`sequence-bar is-subject is-${state}`}
                      style={{
                        left: pct(s.subjectInMs),
                        width: pct(s.subjectOutMs - s.subjectInMs),
                        ...ramp(s.subjectOutMs - s.subjectInMs),
                      }}
                    />
                    {s.leadUntilMs !== null ? (
                      <span
                        className="sequence-bar is-photo is-lead"
                        style={{ left: 0, width: pct(s.leadUntilMs), ...ramp(s.leadUntilMs) }}
                      />
                    ) : null}
                    <span
                      className={`sequence-bar is-photo ${s.fadesOut ? 'is-fading' : ''}`}
                      style={{
                        left: pct(s.backgroundInMs),
                        width: pct(s.goneMs - s.backgroundInMs),
                        ...ramp(s.goneMs - s.backgroundInMs),
                      }}
                    />
                  </span>
                </button>
              )
            })}
            {/* Over the tracks only, so its percentages line up with the bars. */}
            <div className="sequence-overlay" aria-hidden="true">
              {hold > 0 ? (
                <span className="sequence-hold" style={{ left: pct(total - hold), width: pct(hold) }} />
              ) : null}
              <span className="sequence-playhead" style={{ left: pct(timeMs) }} />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
