import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { QUICK_COUNTS } from '../lib/carousel'
import { IMAGE_ACCEPT, listFiles } from '../lib/load-image'
import { FORMAT_PRESETS } from '../lib/platform-presets'
import { fitSlices } from '../lib/welcome-preview'
import type { CarouselDoc } from '../types'
import { Icon } from './icons'
import { PANORAMA_HEIGHT, PANORAMA_WIDTH, PanoramaScene } from './panorama-scene'

type Props = {
  doc: CarouselDoc
  onCount: (count: number) => void
  onFormat: (width: number, height: number) => void
  onFiles: (files: File[]) => void
}

const GAP = 12
const MAX_PREVIEW_W = 1040
const MAX_PREVIEW_H = 236

/**
 * The empty carousel: one way in, plus a preview of the slides that reshapes as the slide count
 * and format change. Every quick count gets a slide element up front, so slides grow in and fade
 * out instead of popping.
 */
export function CarouselWelcome({ doc, onCount, onFormat, onFiles }: Props) {
  const [menu, setMenu] = useState<'count' | 'format' | null>(null)
  const [width, setWidth] = useState(0)
  const previewRef = useRef<HTMLDivElement>(null)
  const setupRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = previewRef.current
    if (!el) return
    const measure = () => setWidth(Math.min(MAX_PREVIEW_W, el.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // A picker closes on a choice, on Escape, or on a press anywhere outside it.
  useEffect(() => {
    if (!menu) return
    const onPointerDown = (e: PointerEvent) => {
      if (!setupRef.current?.contains(e.target as Node)) setMenu(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  const counts = QUICK_COUNTS.includes(doc.count)
    ? QUICK_COUNTS
    : [...QUICK_COUNTS, doc.count].sort((a, b) => a - b)
  const slotCount = Math.max(QUICK_COUNTS[QUICK_COUNTS.length - 1]!, doc.count)
  const format = FORMAT_PRESETS.find((p) => p.width === doc.slideW && p.height === doc.slideH)
  const formatLabel = format ? `${format.name} ${format.label}` : `${doc.slideW} × ${doc.slideH}`
  const height = Math.min(MAX_PREVIEW_H, Math.round(width * 0.55))
  const layout = fitSlices(doc.count, doc.slideW / doc.slideH, { width, height }, GAP, PANORAMA_WIDTH / PANORAMA_HEIGHT)
  const toggle = (name: 'count' | 'format') => setMenu((m) => (m === name ? null : name))

  return (
    <div className="welcome">
      <p className="welcome-chip">
        <span aria-hidden="true" />
        Free, and your photos never leave your device
      </p>
      <h1>One photo. A whole carousel.</h1>
      <p className="welcome-lede">Drop in a wide photo and Stitcher slices it into slides that swipe as one picture.</p>
      <label className="btn btn-primary welcome-choose">
        <Icon name="image" />
        Choose a photo
        <input
          type="file"
          accept={IMAGE_ACCEPT}
          className="visually-hidden"
          onChange={(e) => {
            const files = listFiles(e.target.files)
            if (files.length) onFiles(files)
            e.target.value = ''
          }}
        />
      </label>
      <p className="welcome-hint">or drop one anywhere on the page, or paste it</p>

      <div ref={previewRef} className="welcome-slides" aria-hidden="true" style={{ height }}>
        {width > 0
          ? Array.from({ length: slotCount }, (_, i) => {
              const on = i < doc.count
              return (
                <div
                  key={i}
                  className="welcome-slide"
                  style={{
                    width: on ? layout.slideW : 0,
                    height: layout.slideH,
                    marginLeft: on && i > 0 ? GAP : 0,
                    opacity: on ? 1 : 0,
                  }}
                >
                  <svg
                    viewBox={`0 0 ${PANORAMA_WIDTH} ${PANORAMA_HEIGHT}`}
                    preserveAspectRatio="none"
                    style={{
                      left: layout.sceneX - i * layout.slideW,
                      top: layout.sceneY,
                      width: layout.sceneW,
                      height: layout.sceneH,
                    }}
                  >
                    <PanoramaScene />
                  </svg>
                </div>
              )
            })
          : null}
      </div>

      <div ref={setupRef} className="welcome-setup">
        <div className="welcome-menu">
          <button
            type="button"
            className="welcome-pick"
            aria-expanded={menu === 'count'}
            aria-haspopup="true"
            onClick={() => toggle('count')}
          >
            {doc.count} {doc.count === 1 ? 'slide' : 'slides'}
            <Icon name="chevron-down" size={14} />
          </button>
          {menu === 'count' ? (
            <div className="welcome-menu-panel is-row" role="group" aria-label="How many slides">
              {counts.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`welcome-count ${n === doc.count ? 'on' : ''}`}
                  aria-pressed={n === doc.count}
                  onClick={() => {
                    onCount(n)
                    setMenu(null)
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="welcome-menu">
          <button
            type="button"
            className="welcome-pick"
            aria-expanded={menu === 'format'}
            aria-haspopup="true"
            onClick={() => toggle('format')}
          >
            {formatLabel}
            <Icon name="chevron-down" size={14} />
          </button>
          {menu === 'format' ? (
            <div className="welcome-menu-panel" role="group" aria-label="Slide format">
              {FORMAT_PRESETS.map((p) => {
                const on = p === format
                const long = Math.max(p.width, p.height)
                return (
                  <button
                    key={p.id}
                    type="button"
                    title={p.hint}
                    className={`welcome-format ${on ? 'on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      onFormat(p.width, p.height)
                      setMenu(null)
                    }}
                  >
                    <span className="welcome-format-shape" aria-hidden="true">
                      <span
                        className="format-shape"
                        style={{ width: Math.round((16 * p.width) / long), height: Math.round((16 * p.height) / long) }}
                      />
                    </span>
                    {p.name}
                    <span className="welcome-format-ratio">{p.label}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        <span className="welcome-later">You can change these later</span>
      </div>
    </div>
  )
}
