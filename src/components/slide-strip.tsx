import { MAX_SLIDES } from '../lib/carousel'
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

/** The slides exactly as they'll be posted, in order. */
export function SlideStrip({ doc, thumbs, activeSlide, onSelect, onAdd, onRemove }: Props) {
  const pad = Math.max(2, String(doc.count).length)

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
              aria-label={`Slide ${i + 1}`}
              aria-current={i === activeSlide ? 'true' : undefined}
              onClick={() => onSelect(i)}
            >
              <span
                className={`slide-thumb-frame ${doc.background ? '' : 'is-transparent'}`}
                style={{ aspectRatio: `${doc.slideW} / ${doc.slideH}` }}
              >
                {thumbs[i] ? <img src={thumbs[i]} alt="" /> : null}
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
