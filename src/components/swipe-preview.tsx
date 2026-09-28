import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { renderSlide } from '../lib/render-slide'
import type { CarouselDoc } from '../types'
import { Icon } from './icons'

type Props = {
  doc: CarouselDoc
  startIndex: number
  onClose: () => void
}

const SWIPE_PX = 40

/** Phone-sized preview that pages through slides the way a feed does. */
export function SwipePreview({ doc, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(Math.min(startIndex, doc.count - 1))
  const [slides, setSlides] = useState<string[]>([])
  const [dragX, setDragX] = useState<number | null>(null)
  const startX = useRef(0)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const id = window.setTimeout(() => {
      const target = Math.min(doc.slideH, window.innerHeight * 0.75 * (window.devicePixelRatio || 1))
      const scale = target / doc.slideH
      const type = doc.background ? 'image/jpeg' : 'image/png'
      setSlides(Array.from({ length: doc.count }, (_, i) => renderSlide(doc, i, scale).toDataURL(type, 0.9)))
    }, 0)
    return () => window.clearTimeout(id)
  }, [doc])

  const go = (dir: -1 | 1) => setIndex((i) => Math.max(0, Math.min(doc.count - 1, i + dir)))

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowLeft') go(-1)
    else if (e.key === 'ArrowRight') go(1)
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="preview-backdrop" onClick={onClose}>
      <div
        className="preview"
        role="dialog"
        aria-modal="true"
        aria-label="Swipe preview"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="preview-head">
          <span>
            {index + 1} / {doc.count}
          </span>
          <button ref={closeRef} type="button" className="icon-btn" aria-label="Close preview" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div
          className={`preview-viewport ${doc.background ? '' : 'is-transparent'}`}
          style={{ aspectRatio: `${doc.slideW} / ${doc.slideH}` }}
          onPointerDown={(e) => {
            startX.current = e.clientX
            setDragX(0)
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (dragX !== null) setDragX(e.clientX - startX.current)
          }}
          onPointerUp={() => {
            if (dragX !== null && Math.abs(dragX) > SWIPE_PX) go(dragX < 0 ? 1 : -1)
            setDragX(null)
          }}
          onPointerCancel={() => setDragX(null)}
        >
          <div
            className="preview-track"
            style={{
              transform: `translateX(calc(${-index * 100}% + ${dragX ?? 0}px))`,
              transition: dragX === null ? 'transform 220ms ease' : 'none',
            }}
          >
            {Array.from({ length: doc.count }, (_, i) => (
              <div key={i} className="preview-slide">
                {slides[i] ? <img src={slides[i]} alt={`Slide ${i + 1}`} draggable={false} /> : null}
              </div>
            ))}
          </div>
          {index > 0 ? (
            <button type="button" className="preview-nav prev" aria-label="Previous slide" onClick={() => go(-1)}>
              <Icon name="chevron-left" />
            </button>
          ) : null}
          {index < doc.count - 1 ? (
            <button type="button" className="preview-nav next" aria-label="Next slide" onClick={() => go(1)}>
              <Icon name="chevron-right" />
            </button>
          ) : null}
        </div>
        <div className="preview-dots" aria-hidden="true">
          {Array.from({ length: doc.count }, (_, i) => (
            <span key={i} className={i === index ? 'on' : ''} />
          ))}
        </div>
      </div>
    </div>
  )
}
