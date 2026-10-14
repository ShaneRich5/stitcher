import type { ReactNode } from 'react'
import {
  collageDurationMs,
  cutoutState,
  itemStartMs,
  PACE_PRESETS,
  pacePresetFor,
  type CollageDoc,
  type CutoutState,
} from '../lib/collage'
import { FORMAT_PRESETS, GIF_BACKGROUNDS } from '../lib/platform-presets'
import type { CollageItem } from '../types'
import { PhotoThumb } from './collage-photos'
import { Icon } from './icons'
import { InspectorSections, SoonNote, type InspectorSection } from './inspector-sections'

type Props = {
  variant: 'panel' | 'sheet'
  doc: CollageDoc
  selected: CollageItem | null
  cuttingId: string | null
  onPatch: (patch: Partial<CollageDoc>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: (id: string) => void
  /** Cut the subject out again, for a failed cutout or one that kept the wrong thing. */
  onRecut: (id: string) => void
  /** Show photo `index` on the canvas, from a check. */
  onShow: (index: number) => void
  /** The phone sheet has no side panel, so the photos and video settings become tabs. */
  photos?: ReactNode
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms % 100 ? 2 : 1)}s`
}

const STATE_NOTE: Record<CutoutState, string> = {
  ready: 'cut out',
  cutting: 'cutting out',
  waiting: 'waiting to be cut out',
  failed: 'no cutout',
}

/** The format, file type and length: Studio's side panel on desktop, a tab on phones. */
export function VideoFields({ doc, onPatch }: Pick<Props, 'doc' | 'onPatch'>) {
  const format = FORMAT_PRESETS.find((p) => p.width === doc.width && p.height === doc.height)
  return (
    <div className="post-fields">
      <label htmlFor="collage-format">Format</label>
      <select
        id="collage-format"
        value={format?.id ?? ''}
        onChange={(e) => {
          const p = FORMAT_PRESETS.find((f) => f.id === e.target.value)
          if (p) onPatch({ width: p.width, height: p.height })
        }}
      >
        {format ? null : (
          <option value="" disabled>
            {doc.width} × {doc.height}
          </option>
        )}
        {FORMAT_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} · {p.name}
          </option>
        ))}
      </select>
      <label htmlFor="collage-file">File</label>
      <select id="collage-file" value={doc.format} onChange={(e) => onPatch({ format: e.target.value as CollageDoc['format'] })}>
        <option value="mp4" title="H.264 video, best for Reels and Stories">
          MP4
        </option>
        <option value="webm" title="Web video; less common on social">
          WebM
        </option>
      </select>
      <span>Length</span>
      <span className="post-readout">{(collageDurationMs(doc) / 1000).toFixed(1)} s at 30 fps</span>
    </div>
  )
}

/** Studio's inspector for the collage: the selected photo's cutout, then the video's timing and look. */
export function CollageInspector({ variant, doc, selected, cuttingId, onPatch, onMove, onRemove, onRecut, onShow, photos }: Props) {
  const index = selected ? doc.items.indexOf(selected) : -1
  const state = selected ? cutoutState(selected, cuttingId) : null
  const failed = doc.items.filter((i) => i.failed)
  const waiting = doc.items.filter((i) => !i.cutoutId && !i.failed).length
  const pace = pacePresetFor(doc)

  const head = selected ? (
    <>
      <PhotoThumb item={selected} background={doc.overlay} />
      <span className="inspector-title">
        <strong>{selected.name}</strong>
        <span>
          Photo {index + 1} of {doc.items.length} ·{' '}
          {state === 'ready' ? `${(itemStartMs(doc, index) / 1000).toFixed(1)} s` : STATE_NOTE[state!]}
        </span>
      </span>
      <button type="button" className="icon-btn" aria-label="Move earlier" title="Move earlier" disabled={index <= 0} onClick={() => onMove(-1)}>
        <Icon name="chevron-left" size={16} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Move later"
        title="Move later"
        disabled={index >= doc.items.length - 1}
        onClick={() => onMove(1)}
      >
        <Icon name="chevron-right" size={16} />
      </button>
      <button type="button" className="icon-btn" aria-label="Remove photo" title="Remove photo" onClick={() => onRemove(selected.id)}>
        <Icon name="trash" size={16} />
      </button>
    </>
  ) : (
    <span className="inspector-title">
      <strong>Collage</strong>
      <span>
        {doc.width} × {doc.height} · no photos yet
      </span>
    </span>
  )

  const timing = (
    <div className="inspector-fields">
      <div className="segmented inspector-fit" role="group" aria-label="Pace">
        {PACE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.hint}
            className={`seg-btn ${pace === p.id ? 'on' : ''}`}
            aria-pressed={pace === p.id}
            onClick={() => onPatch(p.pace)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="segmented inspector-fit" role="group" aria-label="Photos behind">
        <button
          type="button"
          title="Each photo fades back out as the next subject arrives, so the video ends on the subjects alone"
          className={`seg-btn ${doc.backgrounds === 'fade' ? 'on' : ''}`}
          aria-pressed={doc.backgrounds === 'fade'}
          onClick={() => onPatch({ backgrounds: 'fade' })}
        >
          Fade out
        </button>
        <button
          type="button"
          title="Each photo stays until the next one covers it, so the video ends on the last photo"
          className={`seg-btn ${doc.backgrounds === 'stay' ? 'on' : ''}`}
          aria-pressed={doc.backgrounds === 'stay'}
          onClick={() => onPatch({ backgrounds: 'stay' })}
        >
          Stay
        </button>
      </div>
      <p className="inspector-note">
        {doc.backgrounds === 'fade'
          ? 'Each photo fades back out as the next subject arrives, so the video ends on the subjects stacked over the overlay.'
          : 'Each photo stays until the next one covers it, so the video ends on the last photo.'}
      </p>
      <label className="range-field" title="Time from one subject appearing to the next">
        <span>Per photo</span>
        <input type="range" min={500} max={4000} step={50} value={doc.stepMs} onChange={(e) => onPatch({ stepMs: Number(e.target.value) })} />
        <output>{seconds(doc.stepMs)}</output>
      </label>
      <label className="range-field" title="How long after its subject a photo fades in behind it">
        <span>Photo behind</span>
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
      <label className="range-field" title="Length of each fade, for subjects and photos">
        <span>Fade</span>
        <input type="range" min={0} max={1500} step={50} value={doc.fadeMs} onChange={(e) => onPatch({ fadeMs: Number(e.target.value) })} />
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
    </div>
  )

  const motion = (
    <div className="inspector-fields">
      <label className="range-field">
        <span>Parallax</span>
        <input type="range" min={0} max={1} step={0.05} value={doc.parallax} onChange={(e) => onPatch({ parallax: Number(e.target.value) })} />
        <output>{doc.parallax > 0 ? `${Math.round(doc.parallax * 100)}%` : 'Off'}</output>
      </label>
      <p className="inspector-note">Each subject pushes in a little ahead of its photo, for a sense of depth. Off keeps both still.</p>
    </div>
  )

  const overlay = (
    <div className="inspector-fields">
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
          <span className="visually-hidden">Custom overlay color</span>
          <input type="color" value={doc.overlay} onChange={(e) => onPatch({ overlay: e.target.value })} />
        </label>
      </div>
      <label className="range-field" title="How strongly the overlay covers the photos">
        <span>Dim photos</span>
        <input type="range" min={0} max={0.8} step={0.05} value={doc.dim} onChange={(e) => onPatch({ dim: Number(e.target.value) })} />
        <output>{Math.round(doc.dim * 100)}%</output>
      </label>
      <p className="inspector-note">Shows before the first photo, then sits over the photos so the subjects stand out.</p>
    </div>
  )

  const cutout = (
    <div className="inspector-fields">
      {!selected ? <p className="inspector-note">Pick a photo to see its cutout.</p> : null}
      {selected && state === 'ready' ? (
        <>
          <p className="inspector-note">Its subject was cut out automatically.</p>
          <button type="button" className="btn btn-outline" onClick={() => onRecut(selected.id)}>
            <Icon name="cutout" size={16} />
            Redo cutout
          </button>
        </>
      ) : null}
      {selected && state === 'failed' ? (
        <p className="check-card is-warn">
          <Icon name="alert" size={16} />
          <span>No subject was found, so only the photo will show.</span>
          <button type="button" className="btn btn-outline" onClick={() => onRecut(selected.id)}>
            Try again
          </button>
        </p>
      ) : null}
      {state === 'cutting' ? <p className="inspector-note">Cutting out the subject…</p> : null}
      {state === 'waiting' ? <p className="inspector-note">Waiting its turn: photos are cut out one at a time.</p> : null}
    </div>
  )

  const checks = (
    <div className="inspector-fields">
      {failed.length ? (
        <p className="check-card is-warn">
          <Icon name="alert" size={16} />
          <span>
            <strong>{failed.length === 1 ? failed[0]!.name : `${failed.length} photos`}</strong>{' '}
            {failed.length === 1 ? 'has' : 'have'} no cutout, so {failed.length === 1 ? 'its photo comes' : 'their photos come'} in with
            nobody added to the stack.
          </span>
          <button type="button" className="btn btn-outline" onClick={() => onShow(doc.items.indexOf(failed[0]!))}>
            Show
          </button>
        </p>
      ) : null}
      {waiting ? (
        <p className="check-card">
          <Icon name="cutout" size={16} />
          <span>
            {waiting} {waiting === 1 ? 'photo is' : 'photos are'} still being cut out. Export waits for them.
          </span>
        </p>
      ) : null}
      {doc.items.length && !failed.length && !waiting ? (
        <p className="check-card is-ok">
          <Icon name="check" size={16} />
          <span>
            Every subject is cut out · {(collageDurationMs(doc) / 1000).toFixed(1)} s
          </span>
        </p>
      ) : null}
      {!doc.items.length ? <p className="inspector-note">Nothing to check yet.</p> : null}
    </div>
  )

  const sections: InspectorSection[] = [
    { id: 'timing', label: 'Timing', body: timing },
    { id: 'motion', label: 'Motion', body: motion },
    { id: 'overlay', label: 'Overlay', body: overlay },
    { id: 'cutout', label: 'Cutout', body: cutout },
    { id: 'look', label: 'Film look', body: <SoonNote>The carousel's looks across the whole video, grain and all.</SoonNote> },
    { id: 'checks', label: 'Checks', body: checks, badge: failed.length },
  ]
  if (photos) {
    sections.unshift(
      { id: 'photos', label: 'Photos', body: <div className="inspector-fields">{photos}</div> },
      {
        id: 'video',
        label: 'Video',
        body: (
          <div className="inspector-fields">
            <VideoFields doc={doc} onPatch={onPatch} />
          </div>
        ),
      },
    )
  }

  return (
    <InspectorSections
      variant={variant}
      label={selected ? `Edit ${selected.name}` : 'Collage settings'}
      head={head}
      storageKey="stitcher.collage.sections"
      defaultOpen={['timing', 'motion', 'overlay', 'cutout', 'checks']}
      sections={sections}
    />
  )
}
