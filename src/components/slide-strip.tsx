import { isLowRes, layerSlides, layerUpscale, MAX_SLIDES } from '../lib/carousel'
import type { CarouselDoc } from '../types'
import { Icon } from './icons'

type Props = {
  doc: CarouselDoc
  thumbs: string[]
  activeSlide: number
  onSelect: (index: number) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

/** Per slide, a note naming each upscaled layer that shows on it, or null. */
function lowResNotes(doc: CarouselDoc): (string | null)[] {
  const notes: string[][] = Array.from({ length: doc.count }, () => [])
  for (const layer of doc.layers) {
    if (!isLowRes(layer)) continue
    for (const i of layerSlides(doc, layer)) notes[i]!.push(`${layer.name} (${layerUpscale(layer).toFixed(1)}×)`)
  }
  return notes.map((n) => (n.length ? `Low resolution: ${n.join(', ')} will look soft here` : null))
}

/** The slides exactly as they'll be posted, in order. */
export function SlideStrip({ doc, thumbs, activeSlide, onSelect, onAdd, onRemove }: Props) {
  const pad = Math.max(2, String(doc.count).length)
  const lowRes = lowResNotes(doc)

  return (
    <nav className="slide-strip" aria-label="Slides">
      <div className="slide-strip-head">
        <strong>Your slides</strong>
        <span>Exactly what gets posted</span>
      </div>
      <ol className="slide-strip-list">
        {Array.from({ length: doc.count }, (_, i) => (
          <li key={i} className={`slide-strip-item ${i === activeSlide ? 'active' : ''}`}>
            <button
              type="button"
              className="slide-thumb"
              aria-label={`Slide ${i + 1}${lowRes[i] ? `. ${lowRes[i]}` : ''}`}
              aria-current={i === activeSlide ? 'true' : undefined}
              onClick={() => onSelect(i)}
            >
              <span
                className={`slide-thumb-frame ${doc.background ? '' : 'is-transparent'}`}
                style={{ aspectRatio: `${doc.slideW} / ${doc.slideH}` }}
              >
                {thumbs[i] ? <img src={thumbs[i]} alt="" /> : null}
                {lowRes[i] ? (
                  <span className="slide-thumb-warn" title={lowRes[i]!}>
                    <Icon name="alert" size={12} />
                  </span>
                ) : null}
              </span>
              <span className="slide-thumb-num">{String(i + 1).padStart(pad, '0')}</span>
            </button>
            {doc.count > 1 ? (
              <button
                type="button"
                className="slide-thumb-remove"
                aria-label={`Remove slide ${i + 1}`}
                title="Remove slide"
                onClick={() => onRemove(i)}
              >
                <Icon name="close" size={12} />
              </button>
            ) : null}
          </li>
        ))}
        <li>
          <button
            type="button"
            className="slide-add"
            aria-label="Add slide"
            title="Add slide"
            disabled={doc.count >= MAX_SLIDES}
            onClick={onAdd}
            style={{ aspectRatio: `${doc.slideW} / ${doc.slideH}` }}
          >
            <Icon name="plus" />
          </button>
        </li>
      </ol>
    </nav>
  )
}
