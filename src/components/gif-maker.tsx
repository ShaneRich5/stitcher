import { useEffect, useEffectEvent, useRef, useState, type DragEvent } from 'react'
import { downloadBlob } from '../lib/download'
import { exportAnimation, type AnimationExportFormat } from '../lib/encode-gif'
import { fitContain } from '../lib/draw-frame'
import {
  applyDurationToAll,
  clearFrameDuration,
  createGifDoc,
  duplicateFrame,
  fpsLabel,
  frameDurations,
  frameStarts,
  hasCustomTiming,
  loopDurationMs,
  outputSize,
  playbackDurations,
  removeFrame,
  reorderFrames,
  setFrameDuration,
  type GifDoc,
} from '../lib/gif-doc'
import { clearHandoff, peekHandoff } from '../lib/handoff'
import { getImage } from '../lib/image-registry'
import { listFiles, loadImageFiles } from '../lib/load-image'
import { makeGifSample } from '../lib/samples'
import { useElementSize } from '../lib/use-element-size'
import { useMediaQuery } from '../lib/use-media-query'
import { useStoredMode } from '../lib/use-stored-mode'
import type { GifFrame } from '../types'
import { AppNav } from './app-nav'
import { FrameStrip } from './frame-strip'
import { FrameTimeline } from './frame-timeline'
import { GifInspector } from './gif-inspector'
import { GifQuick } from './gif-quick'
import { GifScreen } from './gif-screen'
import { Icon } from './icons'
import { ModeSwitch } from './mode-switch'
import { StartOverDialog } from './start-over-dialog'
import { StudioRail } from './studio-rail'

type FrameView = 'strip' | 'timeline'

const VIEW_KEY = 'stitcher.gif.view'
const MODE_KEY = 'stitcher.gif.mode'
/** Room around the frame on Studio's canvas, for its label and some air. */
const CANVAS_PAD = 48

/** Remembering the view is a convenience, so a browser that blocks storage just gets the default. */
function readStoredView(): FrameView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'timeline' ? 'timeline' : 'strip'
  } catch {
    return 'strip'
  }
}

function exportLabel(format: AnimationExportFormat): string {
  switch (format) {
    case 'gif':
      return 'Export GIF'
    case 'mp4':
      return 'Export MP4'
    case 'webm':
      return 'Export WebM'
    case 'png-zip':
      return 'Export PNG ZIP'
    case 'jpeg-zip':
      return 'Export JPEG ZIP'
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable
}

/** A new doc, holding any frames another tool handed over (e.g. carousel slides). */
function initialDoc(): GifDoc {
  const handoff = peekHandoff()
  const doc = createGifDoc()
  return handoff ? { ...doc, frames: handoff.frames, maxSize: handoff.maxSize } : doc
}

export function GifMaker() {
  const [doc, setDoc] = useState<GifDoc>(initialDoc)
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [mode, setMode] = useStoredMode(MODE_KEY)
  const [startOverOpen, setStartOverOpen] = useState(false)
  const [view, setView] = useState<FrameView>(readStoredView)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  /** True while the frames are the sample a first visit opens with; adding frames replaces them. */
  const [sample, setSample] = useState(false)
  /** Bumped by anything that changes the frames wholesale, so a sample still loading doesn't land on top. */
  const sampleRequest = useRef(0)
  const noticeTimer = useRef<number | undefined>(undefined)
  const [canvasRef, canvasBox] = useElementSize()
  const isPhone = useMediaQuery('(max-width: 820px)')
  const studio = mode === 'studio'

  const count = doc.frames.length
  const activeIndex = count ? Math.min(frameIndex, count - 1) : 0
  const active: GifFrame | null = doc.frames[activeIndex] ?? null
  const hasFrames = count > 0
  const customTiming = hasCustomTiming(doc)
  const out = outputSize(doc.frames, doc.maxSize)

  const say = (message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000)
  }

  const patch = (next: Partial<GifDoc>) => setDoc((d) => ({ ...d, ...next }))

  // The doc has taken any handed-over frames, so a later visit starts fresh.
  useEffect(() => clearHandoff(), [])

  /** Show the sample frames, unless something else has filled the doc by the time they're drawn. */
  const loadSample = () => {
    const request = ++sampleRequest.current
    makeGifSample().then((frames) => {
      if (request !== sampleRequest.current) return
      setDoc((d) => (d.frames.length ? d : { ...d, frames }))
      setSample(true)
      setFrameIndex(0)
      setPlaying(true)
    }, console.error)
  }

  // A first visit opens on the sample, unless another tool handed frames over.
  useEffect(() => {
    if (!doc.frames.length) loadSample()
    // Only on arrival: later, an empty doc means the frames were removed on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      // A browser that blocks storage just won't remember the choice.
    }
  }, [view])

  // Advance the preview, holding each frame for exactly as long as the export will.
  useEffect(() => {
    if (!playing || count < 2) return
    // The same per-frame holds the export writes, so the preview matches the file.
    const delay = Math.max(40, playbackDurations(doc)[activeIndex] ?? doc.delayMs)
    const id = window.setTimeout(() => {
      setFrameIndex((i) => {
        const at = Math.min(i, count - 1)
        return doc.reverse ? (at - 1 + count) % count : (at + 1) % count
      })
    }, delay)
    return () => window.clearTimeout(id)
  }, [playing, count, activeIndex, doc])

  const addFiles = async (files: File[]) => {
    const { images: loaded, message } = await loadImageFiles(files)
    if (message) say(message)
    if (!loaded.length) return
    const frames: GifFrame[] = loaded.map((img) => ({
      id: crypto.randomUUID(),
      name: img.name,
      imageId: img.id,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }))
    // Your first frames replace the sample rather than joining it.
    const replace = sample
    sampleRequest.current++
    setSample(false)
    setDoc((d) => ({ ...d, frames: replace ? frames : [...d.frames, ...frames] }))
    if (replace) setFrameIndex(0)
  }

  const removeAt = (id: string) => {
    setDoc((d) => removeFrame(d, id))
    setFrameIndex((i) => Math.max(0, Math.min(i, count - 2)))
  }

  const selectFrame = (i: number) => {
    setFrameIndex(i)
    setPlaying(false)
  }

  const reorder = (from: number, to: number) => {
    setDoc((d) => reorderFrames(d, from, to))
    setFrameIndex(to)
    setPlaying(false)
  }

  const step = (dir: -1 | 1) => {
    if (count < 2) return
    setPlaying(false)
    setFrameIndex((i) => (Math.min(i, count - 1) + dir + count) % count)
  }

  const startOver = () => {
    setStartOverOpen(false)
    setDoc(createGifDoc())
    setFrameIndex(0)
    setPlaying(true)
    setSample(false)
    loadSample()
  }

  const runExport = async () => {
    if (!hasFrames || busy) return
    setBusy(true)
    try {
      const frames = doc.frames.flatMap((f) => {
        const image = getImage(f.imageId)?.image
        return image ? [{ image, naturalWidth: f.naturalWidth, naturalHeight: f.naturalHeight }] : []
      })
      if (!frames.length) throw new Error('Frames are still loading')
      const result = await exportAnimation(doc.format, {
        frames,
        delayMs: doc.delayMs,
        frameDelaysMs: frameDurations(doc),
        maxSize: doc.maxSize,
        reverse: doc.reverse,
        gifRepeat: doc.loopOnce ? -1 : 0,
        holdLastMs: doc.holdLastMs,
        background: doc.background,
      })
      downloadBlob(result.blob, result.filename)
    } catch (e) {
      say(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (isTypingTarget(e.target) || !hasFrames) return
    if (e.key === ' ') {
      e.preventDefault()
      setPlaying((p) => !p)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      step(1)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && active) {
      e.preventDefault()
      removeAt(active.id)
    }
  })

  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    if (isTypingTarget(e.target)) return
    const files = listFiles(e.clipboardData?.files)
    if (files.length) {
      e.preventDefault()
      void addFiles(files)
    }
  })

  useEffect(() => {
    const down = (e: KeyboardEvent) => onKeyDown(e)
    const paste = (e: ClipboardEvent) => onPaste(e)
    window.addEventListener('keydown', down)
    window.addEventListener('paste', paste)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('paste', paste)
    }
  }, [])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = listFiles(e.dataTransfer.files)
    if (files.length) void addFiles(files)
  }

  const navActions = (
    <>
      <span className="nav-readout">
        {hasFrames ? `${count} frame${count > 1 ? 's' : ''} · ${(loopDurationMs(doc) / 1000).toFixed(1)}s` : 'No frames'}
      </span>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!hasFrames || busy}
        onClick={() => void runExport()}
      >
        <Icon name="download" />
        {busy ? 'Encoding…' : exportLabel(doc.format)}
      </button>
    </>
  )

  const reorderable = {
    onSelect: selectFrame,
    onAddFiles: (files: File[]) => void addFiles(files),
    onRemove: removeAt,
    onDuplicate: (id: string) => setDoc((d) => duplicateFrame(d, id)),
    onReorder: reorder,
  }
  const setHold = (id: string, ms: number) => setDoc((d) => setFrameDuration(d, id, ms))
  const follow = (id: string) => setDoc((d) => clearFrameDuration(d, id))

  const inspector = (
    <GifInspector
      variant={isPhone ? 'sheet' : 'panel'}
      doc={doc}
      activeIndex={activeIndex}
      onPatch={patch}
      onHold={setHold}
      onFollow={follow}
      onApplyToAll={(ms) => setDoc((d) => applyDurationToAll(d, ms))}
      onDuplicate={reorderable.onDuplicate}
      onRemove={removeAt}
      onShow={selectFrame}
    />
  )

  const frames =
    view === 'timeline' && !isPhone ? (
      <FrameTimeline
        doc={doc}
        activeIndex={activeIndex}
        playing={playing}
        head={false}
        {...reorderable}
        onDuration={setHold}
        onResetDuration={follow}
        onApplyToAll={(ms) => setDoc((d) => applyDurationToAll(d, ms))}
      />
    ) : (
      <FrameStrip doc={doc} activeIndex={activeIndex} head={false} {...reorderable} />
    )

  const sequence = (
    <section className="sequence" aria-label="Frames">
      <div className="sequence-head">
        <div className="sequence-transport" role="toolbar" aria-label="Playback">
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous frame"
            title="Previous frame (←)"
            disabled={count < 2}
            onClick={() => step(-1)}
          >
            <Icon name="chevron-left" size={16} />
          </button>
          <button
            type="button"
            className="sequence-play"
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause (space)' : 'Play (space)'}
            disabled={count < 2}
            onClick={() => setPlaying((p) => !p)}
          >
            <Icon name={playing ? 'pause' : 'play'} size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Next frame"
            title="Next frame (→)"
            disabled={count < 2}
            onClick={() => step(1)}
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
        <span className="sequence-time">
          {((frameStarts(doc)[activeIndex] ?? 0) / 1000).toFixed(2)} s <span>/ {(loopDurationMs(doc) / 1000).toFixed(2)} s</span>
        </span>
        <span className="sequence-summary">
          {count} {count === 1 ? 'frame' : 'frames'} · {fpsLabel(doc.delayMs)} ·{' '}
          {doc.loopOnce && doc.format === 'gif' ? 'plays once' : 'loops'}
        </span>
        {isPhone ? null : (
          <>
            <span className="sequence-hint">
              {view === 'timeline'
                ? 'Drag a frame to reorder it, or its right edge to hold it longer'
                : customTiming
                  ? 'Some frames have their own timing. The timeline shows it'
                  : 'Drag a frame to reorder it'}
            </span>
            <div className="segmented sequence-views" role="group" aria-label="Frame view">
              <button
                type="button"
                className={`seg-btn ${view === 'strip' ? 'on' : ''}`}
                aria-pressed={view === 'strip'}
                title="Thumbnails in playback order"
                onClick={() => setView('strip')}
              >
                Strip
              </button>
              <button
                type="button"
                className={`seg-btn ${view === 'timeline' ? 'on' : ''}`}
                aria-pressed={view === 'timeline'}
                title="Frames sized by how long they hold"
                onClick={() => setView('timeline')}
              >
                Timeline
              </button>
            </div>
          </>
        )}
      </div>
      {frames}
    </section>
  )

  const screen = fitContain(
    out.width,
    out.height,
    Math.max(1, canvasBox.width - CANVAS_PAD * 2),
    Math.max(1, canvasBox.height - CANVAS_PAD * 2),
  )
  const canvas = (
    <div className="workspace studio-preview" ref={canvasRef}>
      {active ? (
        <>
          <span className="stage-chip">
            <strong>
              Frame {activeIndex + 1} of {count}
            </strong>
            <span>
              {out.width} × {out.height}
            </span>
          </span>
          {canvasBox.width > 0 ? (
            <div className="studio-preview-frame">
              <GifScreen
                frame={active}
                out={out}
                background={doc.background}
                width={screen.width}
                height={screen.height}
                label={`Frame ${activeIndex + 1} of ${count}: ${active.name}`}
              />
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-state">
          <Icon name="film" size={28} />
          <h2>Turn a series of photos into a loop</h2>
          <p>Drop images here, paste them, or add them from the tools on the left.</p>
        </div>
      )}
    </div>
  )

  const quick = (
    <GifQuick
      doc={doc}
      activeIndex={activeIndex}
      playing={playing}
      onTogglePlay={() => setPlaying((p) => !p)}
      onSelect={selectFrame}
      onReorder={reorder}
      onAddFiles={reorderable.onAddFiles}
      onPatch={patch}
      onHold={setHold}
      onFollow={follow}
      onDuplicate={reorderable.onDuplicate}
      onRemove={removeAt}
      onStudio={() => {
        setMode('studio')
        setView('timeline')
      }}
      onStartOver={() => setStartOverOpen(true)}
    />
  )

  const studioStatus =
    studio && !isPhone && hasFrames ? (
      <button type="button" className="btn btn-quiet" onClick={() => setStartOverOpen(true)}>
        <Icon name="restart" size={16} />
        Start over
      </button>
    ) : null

  return (
    <>
      <AppNav actions={navActions} status={studioStatus} center={<ModeSwitch mode={mode} onMode={setMode} />} />
      <div
        className={`editor ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            setDragging(true)
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false)
        }}
        onDrop={onDrop}
      >
        {!studio ? (
          quick
        ) : isPhone ? (
          <div className="studio is-phone">
            <div className="studio-canvas">{canvas}</div>
            {hasFrames ? sequence : null}
            <div className="studio-sheet">{inspector}</div>
          </div>
        ) : (
          <div className="studio is-wide">
            <StudioRail
              addLabel="Add frames"
              soon={[
                { icon: 'text', label: 'Text' },
                { icon: 'shapes', label: 'Shapes and stickers' },
              ]}
              onAddFiles={reorderable.onAddFiles}
            />
            <div className="studio-center">
              {canvas}
              {sequence}
            </div>
            <aside className="studio-inspector" aria-label="Inspector">
              {inspector}
            </aside>
          </div>
        )}

        {dragging ? <div className="drop-overlay">Drop to add frames</div> : null}
        {notice ? (
          <div className="toast" role="status">
            {notice}
          </div>
        ) : null}
      </div>
      {startOverOpen ? (
        <StartOverDialog
          description={`This removes all ${count} ${count === 1 ? 'frame' : 'frames'} and resets the timing. Stitcher only keeps your work in this browser, so it can't be brought back. Export first if you want to keep it.`}
          onConfirm={startOver}
          onCancel={() => setStartOverOpen(false)}
        />
      ) : null}
    </>
  )
}
