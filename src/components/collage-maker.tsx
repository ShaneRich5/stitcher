import { useEffect, useEffectEvent, useRef, useState, type DragEvent } from 'react'
import {
  COLLAGE_FPS,
  collageDurationMs,
  createCollageDoc,
  drawCollageFrame,
  itemIndexAt,
  itemSettledMs,
  moveItem,
  patchItem,
  removeItem,
  type CollageDoc,
} from '../lib/collage'
import { downloadBlob } from '../lib/download'
import { imageFiles, loadImageFile } from '../lib/load-image'
import { removeBackground } from '../lib/remove-background'
import { useMediaQuery } from '../lib/use-media-query'
import type { CollageItem } from '../types'
import { AppNav } from './app-nav'
import { CollageControls } from './collage-controls'
import { CollageStrip } from './collage-strip'
import { Icon } from './icons'

/** The preview canvas renders at most this many pixels on its long edge; export is full size. */
const PREVIEW_MAX = 1280

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable
}

export function CollageMaker() {
  const [doc, setDoc] = useState<CollageDoc>(createCollageDoc)
  const [timeMs, setTimeMs] = useState(0)
  const [playing, setPlaying] = useState(false)
  /** The item whose background is being removed right now. */
  const [cuttingId, setCuttingId] = useState<string | null>(null)
  /** Progress text while cutouts are running; null when idle. */
  const [cutoutStatus, setCutoutStatus] = useState<string | null>(null)
  /** Export progress 0–1 while encoding; null when idle. */
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  const [dockTab, setDockTab] = useState<'timing' | 'export'>('timing')
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const noticeTimer = useRef<number | undefined>(undefined)
  /** Items still waiting for a cutout, processed one at a time by `runCutouts`. */
  const queue = useRef<CollageItem[]>([])
  const queueRunning = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isPhone = useMediaQuery('(max-width: 820px)')

  const count = doc.items.length
  const hasItems = count > 0
  const durationMs = collageDurationMs(doc)
  const time = Math.min(timeMs, durationMs)
  const activeIndex = itemIndexAt(doc, time)
  const waiting = doc.items.filter((i) => !i.cutoutId && !i.failed).length
  const exporting = exportProgress !== null
  const previewScale = Math.min(1, PREVIEW_MAX / Math.max(doc.width, doc.height))

  const say = (message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000)
  }

  const patch = (next: Partial<CollageDoc>) => setDoc((d) => ({ ...d, ...next }))

  // Play the preview in real time and loop it.
  useEffect(() => {
    if (!playing || durationMs <= 0) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const elapsed = now - last
      last = now
      setTimeMs((t) => {
        const next = Math.min(t, durationMs) + elapsed
        return next >= durationMs ? 0 : next
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, durationMs])

  // Redraw on every time step and every edit (including a cutout arriving).
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.setTransform(previewScale, 0, 0, previewScale, 0, 0)
    drawCollageFrame(ctx, doc, time)
  }, [doc, time, previewScale])

  /** Cut out every queued photo in turn. Runs until the queue is empty, even as more are added. */
  const runCutouts = async () => {
    if (queueRunning.current) return
    queueRunning.current = true
    let done = 0
    let failed = 0
    try {
      while (queue.current.length) {
        const item = queue.current.shift()!
        const label = `Cutting out ${done + 1} of ${done + 1 + queue.current.length}…`
        setCuttingId(item.id)
        setCutoutStatus(label)
        try {
          const cutout = await removeBackground(item.imageId, item.name, (fraction) =>
            setCutoutStatus(
              fraction < 1 ? `Downloading the background remover… ${Math.round(fraction * 100)}%` : label,
            ),
          )
          setDoc((d) => patchItem(d, item.id, { cutoutId: cutout.id, failed: false }))
        } catch (e) {
          console.error(e)
          failed++
          setDoc((d) => patchItem(d, item.id, { failed: true }))
        }
        done++
      }
    } finally {
      queueRunning.current = false
      setCuttingId(null)
      setCutoutStatus(null)
    }
    if (failed) {
      say(`Could not cut out ${failed} photo${failed > 1 ? 's' : ''} — retry from the strip`)
    } else if (done) {
      setTimeMs(0)
      setPlaying(true)
    }
  }

  const addFiles = async (files: File[]) => {
    const results = await Promise.allSettled(files.map(loadImageFile))
    const loaded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    const failed = results.length - loaded.length
    if (failed) say(`Could not open ${failed} file${failed > 1 ? 's' : ''}`)
    if (!loaded.length) return
    const items: CollageItem[] = loaded.map((img) => ({
      id: crypto.randomUUID(),
      name: img.name,
      imageId: img.id,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      cutoutId: null,
      failed: false,
    }))
    setDoc((d) => ({ ...d, items: [...d.items, ...items] }))
    queue.current.push(...items)
    void runCutouts()
  }

  const retry = (id: string) => {
    const item = doc.items.find((i) => i.id === id)
    if (!item) return
    setDoc((d) => patchItem(d, id, { failed: false }))
    queue.current.push(item)
    void runCutouts()
  }

  const remove = (id: string) => {
    queue.current = queue.current.filter((i) => i.id !== id)
    setDoc((d) => removeItem(d, id))
  }

  /** Show the moment photo `index` is complete: its subject and background both in. */
  const seekTo = (index: number) => {
    setPlaying(false)
    setTimeMs(itemSettledMs(doc, index))
  }

  const step = (dir: -1 | 1) => {
    if (!hasItems) return
    seekTo(Math.max(0, Math.min(count - 1, activeIndex + dir)))
  }

  const runExport = async () => {
    if (!hasItems || exporting || waiting) return
    setPlaying(false)
    setExportProgress(0)
    try {
      const { encodeTimelineVideo } = await import('../lib/encode-video')
      const snapshot = doc
      const blob = await encodeTimelineVideo(snapshot.format, {
        width: snapshot.width,
        height: snapshot.height,
        durationMs: collageDurationMs(snapshot),
        fps: COLLAGE_FPS,
        draw: (ctx, t) => drawCollageFrame(ctx, snapshot, t),
        onProgress: setExportProgress,
      })
      downloadBlob(blob, `stitcher-collage.${snapshot.format}`)
    } catch (e) {
      say(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExportProgress(null)
    }
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (isTypingTarget(e.target) || !hasItems) return
    if (e.key === ' ') {
      e.preventDefault()
      setPlaying((p) => !p)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      step(1)
    }
  })

  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    if (isTypingTarget(e.target)) return
    const files = imageFiles(e.clipboardData?.files)
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
    const files = imageFiles(e.dataTransfer.files)
    if (files.length) void addFiles(files)
  }

  const controls = (section: 'bar' | 'timing' | 'export') => (
    <CollageControls doc={doc} section={section} onPatch={patch} onAddFiles={(files) => void addFiles(files)} />
  )

  const exportLabel = exporting
    ? `Encoding ${Math.round((exportProgress ?? 0) * 100)}%`
    : waiting
      ? 'Cutting out…'
      : `Export ${doc.format === 'mp4' ? 'MP4' : 'WebM'}`

  const navActions = (
    <>
      <span className="nav-readout">
        {hasItems ? `${count} photo${count > 1 ? 's' : ''} · ${(durationMs / 1000).toFixed(1)}s` : 'No photos'}
      </span>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!hasItems || exporting || waiting > 0}
        onClick={() => void runExport()}
      >
        <Icon name="download" />
        {exportLabel}
      </button>
    </>
  )

  return (
    <>
      <AppNav actions={navActions} />
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
        {isPhone ? null : <div className="split-bar">{controls('bar')}</div>}

        <div className="workspace">
          {hasItems ? (
            <div className="collage-stage">
              <canvas
                ref={canvasRef}
                className="collage-canvas"
                width={Math.round(doc.width * previewScale)}
                height={Math.round(doc.height * previewScale)}
                aria-label="Collage preview"
              />
            </div>
          ) : (
            <div className="empty-state">
              <Icon name="layers" size={28} />
              <h2>Stack your photos into a video</h2>
              <p>
                Pick a few photos. Each subject is cut out and stacks on the ones before it, then its
                background fades in — all on your device.
              </p>
              <label className="btn btn-primary">
                Choose photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="visually-hidden"
                  onChange={(e) => {
                    const files = imageFiles(e.target.files)
                    if (files.length) void addFiles(files)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          )}

          {hasItems ? (
            <div className="playback-bar" role="toolbar" aria-label="Playback">
              <button
                type="button"
                className="tool-btn"
                aria-label="Previous photo"
                title="Previous photo (←)"
                onClick={() => step(-1)}
              >
                <Icon name="chevron-left" />
              </button>
              <button
                type="button"
                className="tool-btn play-btn"
                aria-label={playing ? 'Pause' : 'Play'}
                aria-pressed={playing}
                title={playing ? 'Pause (space)' : 'Play (space)'}
                onClick={() => setPlaying((p) => !p)}
              >
                <Icon name={playing ? 'pause' : 'play'} />
              </button>
              <button
                type="button"
                className="tool-btn"
                aria-label="Next photo"
                title="Next photo (→)"
                onClick={() => step(1)}
              >
                <Icon name="chevron-right" />
              </button>
              <input
                type="range"
                className="collage-scrub"
                aria-label="Position"
                min={0}
                max={durationMs}
                step={10}
                value={time}
                onChange={(e) => {
                  setPlaying(false)
                  setTimeMs(Number(e.target.value))
                }}
              />
              <span className="playback-count" aria-live="off">
                {(time / 1000).toFixed(1)} / {(durationMs / 1000).toFixed(1)}s
              </span>
            </div>
          ) : null}
        </div>

        <div className="frames-pane">
          <CollageStrip
            doc={doc}
            activeIndex={activeIndex}
            cuttingId={cuttingId}
            onSelect={seekTo}
            onAddFiles={(files) => void addFiles(files)}
            onRemove={remove}
            onRetry={retry}
            onReorder={(from, to) => setDoc((d) => moveItem(d, from, to))}
          />
        </div>

        {isPhone ? (
          <div className="dock">
            <div className="dock-tabs" role="tablist" aria-label="Controls">
              <button
                type="button"
                role="tab"
                aria-selected={dockTab === 'timing'}
                className={dockTab === 'timing' ? 'on' : ''}
                onClick={() => setDockTab('timing')}
              >
                Timing
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dockTab === 'export'}
                className={dockTab === 'export' ? 'on' : ''}
                onClick={() => setDockTab('export')}
              >
                Export
              </button>
            </div>
            <div className="dock-body">{controls(dockTab)}</div>
          </div>
        ) : null}

        {dragging ? <div className="drop-overlay">Drop to add photos</div> : null}
        {cutoutStatus || notice ? (
          <div className="toast" role="status">
            {cutoutStatus ?? notice}
          </div>
        ) : null}
      </div>
    </>
  )
}
