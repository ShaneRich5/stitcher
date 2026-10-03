import { useEffect, useEffectEvent, useRef, useState, type DragEvent } from 'react'
import { downloadBlob } from '../lib/download'
import { exportAnimation, type AnimationExportFormat } from '../lib/encode-gif'
import {
  createGifDoc,
  duplicateFrame,
  loopDurationMs,
  removeFrame,
  reorderFrames,
  type GifDoc,
} from '../lib/gif-doc'
import { getImage } from '../lib/image-registry'
import { imageFiles, loadImageFile } from '../lib/load-image'
import { useMediaQuery } from '../lib/use-media-query'
import type { GifFrame } from '../types'
import { AppNav } from './app-nav'
import { FrameStrip } from './frame-strip'
import { GifControls } from './gif-controls'
import { Icon } from './icons'

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

export function GifMaker() {
  const [doc, setDoc] = useState<GifDoc>(createGifDoc)
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [dockTab, setDockTab] = useState<'loop' | 'export'>('loop')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const noticeTimer = useRef<number | undefined>(undefined)
  const isPhone = useMediaQuery('(max-width: 820px)')

  const count = doc.frames.length
  const activeIndex = count ? Math.min(frameIndex, count - 1) : 0
  const active: GifFrame | null = doc.frames[activeIndex] ?? null
  const hasFrames = count > 0

  const say = (message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000)
  }

  const patch = (next: Partial<GifDoc>) => setDoc((d) => ({ ...d, ...next }))

  // Advance the preview. The last frame holds for the extra time it will hold in the export.
  useEffect(() => {
    if (!playing || count < 2) return
    const isLast = doc.reverse ? activeIndex === 0 : activeIndex === count - 1
    const delay = Math.max(40, doc.delayMs + (isLast ? doc.holdLastMs : 0))
    const id = window.setTimeout(() => {
      setFrameIndex((i) => {
        const at = Math.min(i, count - 1)
        return doc.reverse ? (at - 1 + count) % count : (at + 1) % count
      })
    }, delay)
    return () => window.clearTimeout(id)
  }, [playing, count, activeIndex, doc.delayMs, doc.holdLastMs, doc.reverse])

  const addFiles = async (files: File[]) => {
    const results = await Promise.allSettled(files.map(loadImageFile))
    const loaded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    const failed = results.length - loaded.length
    if (failed) say(`Could not open ${failed} file${failed > 1 ? 's' : ''}`)
    if (!loaded.length) return
    const frames: GifFrame[] = loaded.map((img) => ({
      id: crypto.randomUUID(),
      name: img.name,
      imageId: img.id,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }))
    setDoc((d) => ({ ...d, frames: [...d.frames, ...frames] }))
  }

  const removeAt = (id: string) => {
    setDoc((d) => removeFrame(d, id))
    setFrameIndex((i) => Math.max(0, Math.min(i, count - 2)))
  }

  const step = (dir: -1 | 1) => {
    if (count < 2) return
    setPlaying(false)
    setFrameIndex((i) => (Math.min(i, count - 1) + dir + count) % count)
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

  const controls = (section: 'bar' | 'loop' | 'export') => (
    <GifControls
      doc={doc}
      section={section}
      onPatch={patch}
      onAddFiles={(files) => void addFiles(files)}
    />
  )

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
          {active ? (
            <div className="gif-stage" style={{ background: doc.background }}>
              <img className="gif-stage-img" src={getImage(active.imageId)?.url} alt={active.name} />
            </div>
          ) : null}

          {!hasFrames ? (
            <div className="empty-state">
              <Icon name="film" size={28} />
              <h2>Turn a series of photos into a loop</h2>
              <p>
                Drop images here, paste them, or pick them below. They play in order as a GIF or a
                video — all encoded on your device.
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
          ) : null}

          {hasFrames ? (
            <div className="playback-bar" role="toolbar" aria-label="Playback">
              <button
                type="button"
                className="tool-btn"
                aria-label="Previous frame"
                title="Previous frame (←)"
                disabled={count < 2}
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
                disabled={count < 2}
                onClick={() => setPlaying((p) => !p)}
              >
                <Icon name={playing ? 'pause' : 'play'} />
              </button>
              <button
                type="button"
                className="tool-btn"
                aria-label="Next frame"
                title="Next frame (→)"
                disabled={count < 2}
                onClick={() => step(1)}
              >
                <Icon name="chevron-right" />
              </button>
              <span className="playback-count" aria-live="off">
                {activeIndex + 1} / {count}
              </span>
            </div>
          ) : null}
        </div>

        <FrameStrip
          doc={doc}
          activeIndex={activeIndex}
          onSelect={(i) => {
            setFrameIndex(i)
            setPlaying(false)
          }}
          onAddFiles={(files) => void addFiles(files)}
          onRemove={removeAt}
          onDuplicate={(id) => setDoc((d) => duplicateFrame(d, id))}
          onReorder={(from, to) => {
            setDoc((d) => reorderFrames(d, from, to))
            setFrameIndex(to)
            setPlaying(false)
          }}
        />

        {isPhone ? (
          <div className="dock">
            <div className="dock-tabs" role="tablist" aria-label="Controls">
              <button
                type="button"
                role="tab"
                aria-selected={dockTab === 'loop'}
                className={dockTab === 'loop' ? 'on' : ''}
                onClick={() => setDockTab('loop')}
              >
                Loop
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

        {dragging ? <div className="drop-overlay">Drop to add frames</div> : null}
        {notice ? (
          <div className="toast" role="status">
            {notice}
          </div>
        ) : null}
      </div>
    </>
  )
}
