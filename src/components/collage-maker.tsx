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
import { hasSeenExample, markExampleSeen } from '../lib/first-use'
import { listFiles, loadImageFiles } from '../lib/load-image'
import { removeBackground } from '../lib/remove-background'
import { makeCollageSample } from '../lib/samples'
import { useMediaQuery } from '../lib/use-media-query'
import { useStoredMode } from '../lib/use-stored-mode'
import type { CollageItem } from '../types'
import { AppNav } from './app-nav'
import { CollageInspector, VideoFields } from './collage-inspector'
import { CollagePhotos } from './collage-photos'
import { CollageQuick } from './collage-quick'
import { CollageSequence } from './collage-sequence'
import { Icon } from './icons'
import { ModeSwitch } from './mode-switch'
import { QuickGuide, type GuideStep } from './quick-guide'
import { StartOverDialog } from './start-over-dialog'
import { StudioRail } from './studio-rail'
import { CollageWelcomePreview, ToolWelcome } from './tool-welcome'

/** The preview canvas renders at most this many pixels on its long edge; export is full size. */
const PREVIEW_MAX = 1280
const MODE_KEY = 'stitcher.collage.mode'

/** The quick guide over the example, one stop per part of Quick's layout. */
const GUIDE: GuideStep[] = [
  {
    target: 'player',
    title: 'This is an example',
    body: 'Five photos of one friend. Each is cut out and stacks on the last, then its photo fades in behind.',
  },
  {
    target: 'photos',
    title: 'Your photos, in order',
    body: 'They stack in this order; drag one to move it. The cutouts are made on your device.',
  },
  { target: 'pace', title: 'Pick a pace', body: 'How quickly each photo lands. Depth makes each one push in as it arrives.' },
  {
    target: 'add',
    title: 'Now use your own photos',
    body: 'Add a few photos of the same person and they replace the example.',
  },
  {
    target: 'export',
    title: 'Export when it looks right',
    body: 'A video sized for Stories and Reels, made on your device.',
  },
]

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
  const [mode, setMode] = useStoredMode(MODE_KEY)
  /** The photo the toolbar and inspector act on; the one arriving in the preview until one is picked. */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [startOverOpen, setStartOverOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  /** True while the photos are the sample a first visit opens with; adding photos replaces them. */
  const [sample, setSample] = useState(false)
  /** Bumped by anything that changes the photos wholesale, so a sample still loading doesn't land on top. */
  const sampleRequest = useRef(0)
  /** True while the sample is being drawn, so the landing page doesn't flash up before it. */
  const [sampleLoading, setSampleLoading] = useState(() => !hasSeenExample('collage'))
  const [guide, setGuide] = useState(false)
  const noticeTimer = useRef<number | undefined>(undefined)
  /** Items still waiting for a cutout, processed one at a time by `runCutouts`. */
  const queue = useRef<CollageItem[]>([])
  const queueRunning = useRef(false)
  /** State rather than a ref, so the canvas is drawn again when switching modes mounts a new one. */
  const [canvasEl, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const isPhone = useMediaQuery('(max-width: 820px)')
  const studio = mode === 'studio'

  const count = doc.items.length
  const hasItems = count > 0
  const durationMs = collageDurationMs(doc)
  const time = Math.min(timeMs, durationMs)
  const activeIndex = itemIndexAt(doc, time)
  const waiting = doc.items.filter((i) => !i.cutoutId && !i.failed).length
  const exporting = exportProgress !== null
  const previewScale = Math.min(1, PREVIEW_MAX / Math.max(doc.width, doc.height))
  const selected = doc.items.find((i) => i.id === selectedId) ?? doc.items[activeIndex] ?? null

  const say = (message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000)
  }

  const patch = (next: Partial<CollageDoc>) => setDoc((d) => ({ ...d, ...next }))

  /**
   * Show the sample photos, cut out already, with the quick guide over them, unless photos have
   * been added by the time they're drawn.
   */
  const loadSample = (width: number, height: number) => {
    const request = ++sampleRequest.current
    makeCollageSample(width, height).then(
      (items) => {
        if (request !== sampleRequest.current) return
        setDoc((d) => (d.items.length ? d : { ...d, items }))
        setSample(true)
        setGuide(true)
        setTimeMs(0)
        setPlaying(true)
        setSampleLoading(false)
      },
      (e) => {
        console.error(e)
        setSampleLoading(false)
      },
    )
  }

  /** The landing page's way back to the example. The guide walks Quick's layout, so it switches there. */
  const showExample = () => {
    setMode('quick')
    setSampleLoading(true)
    loadSample(doc.width, doc.height)
  }

  const closeGuide = () => {
    setGuide(false)
    markExampleSeen('collage')
  }

  // The first visit opens on the example, playing. After that, an empty tool is the landing page.
  useEffect(() => {
    if (sampleLoading) loadSample(doc.width, doc.height)
    // Only on arrival: later, an empty doc means the photos were removed on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const ctx = canvasEl?.getContext('2d')
    if (!ctx) return
    ctx.setTransform(previewScale, 0, 0, previewScale, 0, 0)
    drawCollageFrame(ctx, doc, time)
  }, [canvasEl, doc, time, previewScale])

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
    const { images: loaded, message } = await loadImageFiles(files)
    if (message) say(message)
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
    // Your first photos replace the sample rather than joining it.
    const replace = sample
    sampleRequest.current++
    setSample(false)
    setGuide(false)
    setSampleLoading(false)
    if (replace) markExampleSeen('collage')
    setDoc((d) => ({ ...d, items: replace ? items : [...d.items, ...items] }))
    if (replace) {
      setSelectedId(null)
      setTimeMs(0)
      setPlaying(false)
    }
    queue.current.push(...items)
    void runCutouts()
  }

  const retry = (id: string) => {
    const item = doc.items.find((i) => i.id === id)
    if (!item) return
    // Also clears a cutout that kept the wrong thing, so this redoes one as well as retrying.
    setDoc((d) => patchItem(d, id, { failed: false, cutoutId: null }))
    queue.current.push(item)
    void runCutouts()
  }

  const remove = (id: string) => {
    queue.current = queue.current.filter((i) => i.id !== id)
    setDoc((d) => removeItem(d, id))
    if (id === selectedId) setSelectedId(null)
  }

  const startOver = () => {
    setStartOverOpen(false)
    queue.current = []
    setDoc(createCollageDoc())
    setSelectedId(null)
    setTimeMs(0)
    setPlaying(false)
    setSample(false)
    setGuide(false)
    sampleRequest.current++
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
        data-guide="export"
        onClick={() => void runExport()}
      >
        <Icon name="download" />
        {exportLabel}
      </button>
    </>
  )

  const select = (index: number) => {
    const item = doc.items[index]
    if (!item) return
    setSelectedId(item.id)
    seekTo(index)
  }

  const move = (dir: -1 | 1) => {
    if (!selected) return
    const from = doc.items.indexOf(selected)
    setDoc((d) => moveItem(d, from, from + dir))
  }

  const canvas = (
    <canvas
      ref={setCanvas}
      className="collage-canvas"
      width={Math.round(doc.width * previewScale)}
      height={Math.round(doc.height * previewScale)}
      aria-label="Collage preview"
    />
  )

  const photos = (
    <CollagePhotos
      doc={doc}
      selectedId={selected?.id ?? null}
      cuttingId={cuttingId}
      onSelect={select}
      onReorder={(from, to) => setDoc((d) => moveItem(d, from, to))}
      onRetry={retry}
    />
  )

  const inspector = (
    <CollageInspector
      variant={isPhone ? 'sheet' : 'panel'}
      doc={doc}
      selected={selected}
      cuttingId={cuttingId}
      onPatch={patch}
      onMove={move}
      onRemove={remove}
      onRecut={retry}
      onShow={select}
      photos={isPhone ? photos : undefined}
    />
  )

  const sequence = (
    <CollageSequence
      doc={doc}
      timeMs={time}
      durationMs={durationMs}
      playing={playing}
      selectedId={selected?.id ?? null}
      cuttingId={cuttingId}
      onTogglePlay={() => setPlaying((p) => !p)}
      onStep={step}
      onSelect={select}
      lanes={!isPhone}
    />
  )

  const stage = (
    <div className="workspace studio-preview">
      {hasItems ? (
        <>
          <span className="stage-chip">
            <strong>{time >= durationMs - doc.holdEndMs ? 'End hold' : `Photo ${activeIndex + 1} arriving`}</strong>
            <span>
              {doc.width} × {doc.height}
            </span>
          </span>
          <div className="collage-stage">{canvas}</div>
        </>
      ) : null}
    </div>
  )

  const studioStatus =
    studio && !isPhone && hasItems ? (
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
        {!hasItems ? (
          sampleLoading ? null : (
            <ToolWelcome
              title="Stack photos into a video."
              lede="Pick a few photos of the same person. Each one is cut out and stacked on the last, as its photo fades in behind."
              chooseLabel="Choose photos"
              onFiles={(files) => void addFiles(files)}
              onExample={showExample}
              preview={<CollageWelcomePreview />}
              others={[
                { to: '/carousel', label: 'Carousel' },
                { to: '/gif', label: 'GIF' },
              ]}
            />
          )
        ) : !studio ? (
          <CollageQuick
            doc={doc}
            canvas={canvas}
            photos={photos}
            selected={selected}
            timeMs={time}
            durationMs={durationMs}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            onScrub={(ms) => {
              setPlaying(false)
              setTimeMs(ms)
            }}
            onAddFiles={(files) => void addFiles(files)}
            onPatch={patch}
            onMove={move}
            onRecut={retry}
            onRemove={remove}
            onStudio={() => setMode('studio')}
            onStartOver={() => setStartOverOpen(true)}
          />
        ) : isPhone ? (
          <div className="studio is-phone">
            <div className="studio-canvas">{stage}</div>
            {hasItems ? sequence : null}
            <div className="studio-sheet">{inspector}</div>
          </div>
        ) : (
          <div className="studio">
            <StudioRail
              addLabel="Add photos"
              soon={[
                { icon: 'text', label: 'Text' },
                { icon: 'templates', label: 'Grid layouts' },
              ]}
              onAddFiles={(files) => void addFiles(files)}
            />
            <aside className="studio-side" aria-label="Photos and video">
              <section className="studio-panel layers-panel" aria-labelledby="photos-heading">
                <h2 id="photos-heading" className="studio-heading">
                  Photos
                </h2>
                <p className="studio-hint">First to last. Each stacks on the ones before.</p>
                {photos}
              </section>
              <section className="studio-panel post-panel" aria-labelledby="video-heading">
                <h2 id="video-heading" className="studio-heading">
                  Video
                </h2>
                <VideoFields doc={doc} onPatch={patch} />
              </section>
            </aside>
            <div className="studio-center">
              {stage}
              {hasItems ? sequence : null}
            </div>
            <aside className="studio-inspector" aria-label="Inspector">
              {inspector}
            </aside>
          </div>
        )}

        {guide && hasItems ? <QuickGuide label="Collage quick guide" steps={GUIDE} onClose={closeGuide} /> : null}
        {dragging ? <div className="drop-overlay">Drop to add photos</div> : null}
        {cutoutStatus || notice ? (
          <div className="toast" role="status">
            {cutoutStatus ?? notice}
          </div>
        ) : null}
      </div>
      {startOverOpen ? (
        <StartOverDialog
          description={`This removes all ${count} ${count === 1 ? 'photo' : 'photos'} and their cutouts, and resets the timing. Stitcher only keeps your work in this browser, so it can't be brought back. Export first if you want to keep it.`}
          onConfirm={startOver}
          onCancel={() => setStartOverOpen(false)}
        />
      ) : null}
    </>
  )
}
