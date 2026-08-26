import { useEffect, useId, useRef, useState } from 'react'
import {
  exportAnimation,
  type AnimationExportFormat,
} from '../lib/encode-gif'

type GifFrame = {
  id: string
  name: string
  url: string
  image: HTMLImageElement
}

const PRIMARY_FORMAT_OPTIONS: {
  value: AnimationExportFormat
  label: string
  hint: string
}[] = [
  {
    value: 'mp4',
    label: 'MP4',
    hint: 'H.264 video — best for Instagram Reels / feed video',
  },
  {
    value: 'gif',
    label: 'GIF',
    hint: 'Animated .gif — works in Instagram posts',
  },
]

const MORE_FORMAT_OPTIONS: {
  value: AnimationExportFormat
  label: string
  hint: string
}[] = [
  {
    value: 'webm',
    label: 'WebM',
    hint: 'Web video format; great for web, less common on Instagram',
  },
  {
    value: 'png-zip',
    label: 'PNG frames (ZIP)',
    hint: 'Lossless stills, one file per frame',
  },
  {
    value: 'jpeg-zip',
    label: 'JPEG frames (ZIP)',
    hint: 'Smaller stills for uploading separately',
  },
]

const MORE_FORMAT_VALUES = new Set(MORE_FORMAT_OPTIONS.map((o) => o.value))

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function exportButtonLabel(format: AnimationExportFormat, busy: boolean): string {
  if (busy) return 'Encoding…'
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

function usesFrameDelay(format: AnimationExportFormat): boolean {
  return format === 'gif' || format === 'mp4' || format === 'webm'
}

export function GifMaker() {
  const fileInputId = useId()
  const formatFieldId = useId()
  const urlsRef = useRef(new Set<string>())
  const [frames, setFrames] = useState<GifFrame[]>([])
  const [delayMs, setDelayMs] = useState(400)
  const [maxSize, setMaxSize] = useState(720)
  const [format, setFormat] = useState<AnimationExportFormat>('mp4')
  const [showMoreFormats, setShowMoreFormats] = useState(false)
  const [loopPreview, setLoopPreview] = useState(true)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trackUrl = (url: string) => {
    urlsRef.current.add(url)
  }

  const revokeUrl = (url: string) => {
    if (urlsRef.current.has(url)) {
      URL.revokeObjectURL(url)
      urlsRef.current.delete(url)
    }
  }

  useEffect(() => {
    return () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url)
      urlsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!loopPreview || frames.length < 2) return
    const id = window.setInterval(() => {
      setPreviewIndex((i) => (i + 1) % frames.length)
    }, Math.max(50, delayMs))
    return () => window.clearInterval(id)
  }, [loopPreview, frames.length, delayMs])

  useEffect(() => {
    if (previewIndex >= frames.length) setPreviewIndex(0)
  }, [frames.length, previewIndex])

  const onFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return
    setError(null)
    const list = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    for (const file of list) {
      const url = URL.createObjectURL(file)
      trackUrl(url)
      const id = crypto.randomUUID()
      const img = new Image()
      img.onload = () => {
        setFrames((prev) => [
          ...prev,
          { id, name: file.name, url, image: img },
        ])
      }
      img.onerror = () => {
        revokeUrl(url)
        setError(`Could not load ${file.name}`)
      }
      img.src = url
    }
  }

  const removeFrame = (id: string) => {
    setFrames((prev) =>
      prev.filter((f) => {
        if (f.id === id) revokeUrl(f.url)
        return f.id !== id
      }),
    )
  }

  const moveFrame = (id: string, dir: -1 | 1) => {
    setFrames((prev) => {
      const i = prev.findIndex((f) => f.id === id)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(i, 1)
      next.splice(j, 0, item!)
      return next
    })
  }

  const clearFrames = () => {
    setFrames((prev) => {
      for (const f of prev) revokeUrl(f.url)
      return []
    })
    setPreviewIndex(0)
  }

  const runExport = async () => {
    if (!frames.length) return
    setBusy(true)
    setError(null)
    try {
      const result = await exportAnimation(format, {
        frames: frames.map((f) => ({
          image: f.image,
          naturalWidth: f.image.naturalWidth || f.image.width,
          naturalHeight: f.image.naturalHeight || f.image.height,
        })),
        delayMs,
        maxSize,
      })
      downloadBlob(result.blob, result.filename)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export')
    } finally {
      setBusy(false)
    }
  }

  const active = frames[previewIndex] ?? frames[0] ?? null
  const fps = delayMs > 0 ? (1000 / delayMs).toFixed(1) : '—'

  return (
    <div className="tool">
      <header className="tool-header">
        <div>
          <h1 className="tool-title">GIF</h1>
          <p className="tool-sub">
            Drop a series of images, set the frame delay, preview the loop, then export as GIF or
            video. Encoding runs entirely in the browser — MP4 is ideal for Instagram video.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn primary"
            onClick={runExport}
            disabled={!frames.length || busy}
          >
            {exportButtonLabel(format, busy)}
          </button>
        </div>
      </header>

      <div className="tool-body">
        <aside className="sidebar">
          <section className="panel">
            <h2>Frames</h2>
            <p className="hint">Order is top → bottom. Move frames with the arrows.</p>
            <input
              id={fileInputId}
              type="file"
              accept="image/*"
              multiple
              className="visually-hidden"
              onChange={(e) => {
                onFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <label htmlFor={fileInputId} className="btn secondary file-label">
              Add images
            </label>
            {frames.length ? (
              <button type="button" className="btn danger-outline small-margin" onClick={clearFrames}>
                Clear all
              </button>
            ) : null}

            <ul className="layer-list">
              {frames.map((f, i) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className={`layer-item ${previewIndex === i ? 'active' : ''}`}
                    onClick={() => {
                      setLoopPreview(false)
                      setPreviewIndex(i)
                    }}
                  >
                    <span className="layer-name">
                      {i + 1}. {f.name}
                    </span>
                  </button>
                  <div className="layer-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Move earlier"
                      onClick={() => moveFrame(f.id, -1)}
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Move later"
                      onClick={() => moveFrame(f.id, 1)}
                    >
                      ▶
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="Remove"
                      onClick={() => removeFrame(f.id)}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {!frames.length ? (
              <p className="hint muted">No frames yet. Add images to build a GIF.</p>
            ) : null}
          </section>

          <section className="panel">
            <h2>Export format</h2>
            <div className="format-list" role="radiogroup" aria-labelledby={formatFieldId}>
              <span id={formatFieldId} className="visually-hidden">
                Export format
              </span>
              {PRIMARY_FORMAT_OPTIONS.map((opt) => (
                <label key={opt.value} className="format-option">
                  <input
                    type="radio"
                    name="export-format"
                    value={opt.value}
                    checked={format === opt.value}
                    onChange={() => setFormat(opt.value)}
                  />
                  <span className="format-option-text">
                    <span className="format-option-label">{opt.label}</span>
                    <span className="format-option-hint">{opt.hint}</span>
                  </span>
                </label>
              ))}
              {showMoreFormats
                ? MORE_FORMAT_OPTIONS.map((opt) => (
                    <label key={opt.value} className="format-option">
                      <input
                        type="radio"
                        name="export-format"
                        value={opt.value}
                        checked={format === opt.value}
                        onChange={() => setFormat(opt.value)}
                      />
                      <span className="format-option-text">
                        <span className="format-option-label">{opt.label}</span>
                        <span className="format-option-hint">{opt.hint}</span>
                      </span>
                    </label>
                  ))
                : null}
            </div>
            <button
              type="button"
              className="btn link-btn small-margin"
              aria-expanded={showMoreFormats}
              onClick={() => {
                setShowMoreFormats((open) => {
                  if (open && MORE_FORMAT_VALUES.has(format)) {
                    setFormat('mp4')
                  }
                  return !open
                })
              }}
            >
              {showMoreFormats ? 'Show less' : 'Show more formats'}
            </button>
          </section>

          <section className="panel">
            <h2>Timing</h2>
            <label className="field">
              <span>Delay per frame (ms)</span>
              <input
                type="number"
                min={50}
                step={10}
                value={delayMs}
                onChange={(e) =>
                  setDelayMs(Math.max(50, Math.floor(Number(e.target.value) || 50)))
                }
                disabled={!usesFrameDelay(format)}
              />
            </label>
            <p className="hint muted">
              {usesFrameDelay(format)
                ? `≈ ${fps} fps`
                : 'Delay applies to GIF and video exports'}
            </p>
            <label className="field small-margin">
              <span>Max output size (px)</span>
              <input
                type="number"
                min={64}
                step={1}
                value={maxSize}
                onChange={(e) =>
                  setMaxSize(Math.max(64, Math.floor(Number(e.target.value) || 64)))
                }
              />
            </label>
            <label className="check-row small-margin">
              <input
                type="checkbox"
                checked={loopPreview}
                onChange={(e) => setLoopPreview(e.target.checked)}
              />
              <span>Loop preview</span>
            </label>
          </section>
        </aside>

        <main className="main">
          <div className="gif-preview">
            {active ? (
              <img src={active.url} alt={active.name} className="gif-preview-img" />
            ) : (
              <p className="hint muted">Preview appears here once you add frames.</p>
            )}
          </div>
          {frames.length ? (
            <p className="footer-hint">
              Frame {Math.min(previewIndex + 1, frames.length)} of {frames.length}
              {loopPreview ? ' · looping' : ''}
            </p>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
        </main>
      </div>
    </div>
  )
}
