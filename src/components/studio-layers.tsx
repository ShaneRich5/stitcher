import { useState, type KeyboardEvent } from 'react'
import { isLowRes, layerSlides, layerUpscale, MAX_SLIDES } from '../lib/carousel'
import { FILM_LOOKS } from '../lib/film-looks'
import { getImage } from '../lib/image-registry'
import { FORMAT_PRESETS } from '../lib/platform-presets'
import type { CarouselDoc, Layer } from '../types'
import { Icon } from './icons'

const DRAG_TYPE = 'text/x-stitcher-layer'

/** A short line under a layer's name: a warning if it will look soft, else where it sits and what's on it. */
function layerNote(doc: CarouselDoc, layer: Layer): { text: string; warn: boolean } {
  if (!layer.hidden && isLowRes(layer)) return { text: `Stretched ${layerUpscale(layer).toFixed(1)}×`, warn: true }
  const parts: string[] = []
  if (layer.fit === 'fill') parts.push(`Fills ${doc.count} ${doc.count === 1 ? 'slide' : 'slides'}`)
  else if (layer.fit === 'fit') parts.push('Fits the slides')
  else {
    const on = layerSlides(doc, layer)
    parts.push(
      !on.length
        ? 'Off the slides'
        : on.length === 1
          ? `Slide ${on[0]! + 1}`
          : `Slides ${on[0]! + 1}–${on[on.length - 1]! + 1}`,
    )
  }
  if (layer.look?.film) parts.push(FILM_LOOKS.find((f) => f.id === layer.look!.film)?.name ?? 'Look')
  else if (layer.look) parts.push('Adjusted')
  if (layer.outline) parts.push('Outline')
  if (layer.shadow) parts.push('Shadow')
  if (layer.blur) parts.push(`Blur ${Math.round(layer.blur)}`)
  if (layer.dateStamp) parts.push('Date')
  return { text: parts.join(' · '), warn: false }
}

function LayerThumb({ layer }: { layer: Layer }) {
  const img = getImage(layer.imageId)
  return <span className="layer-thumb is-transparent">{img ? <img src={img.url} alt="" /> : null}</span>
}

type LayersProps = {
  doc: CarouselDoc
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Move a layer to `index` in the stack, 0 being the bottom. */
  onReorder: (id: string, index: number) => void
  onToggleHidden: (id: string) => void
  onToggleLocked: (id: string) => void
}

/**
 * Every layer, top of the stack first. Drag a row (or Alt + arrow keys on it) to restack it; the
 * eye and lock buttons hide a layer or stop it being grabbed on the canvas.
 */
export function LayersPanel({ doc, selectedId, onSelect, onReorder, onToggleHidden, onToggleLocked }: LayersProps) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const top = doc.layers.length - 1

  const onRowKeyDown = (e: KeyboardEvent, layer: Layer, index: number) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    onReorder(layer.id, index + (e.key === 'ArrowUp' ? 1 : -1))
  }

  return (
    <section className="studio-panel layers-panel" aria-labelledby="layers-heading">
      <h2 id="layers-heading" className="studio-heading">
        Layers
      </h2>
      {doc.layers.length ? (
        <ul className="layer-rows">
          {[...doc.layers].reverse().map((layer, i) => {
            const index = top - i
            const note = layerNote(doc, layer)
            const on = layer.id === selectedId
            return (
              <li
                key={layer.id}
                className={`layer-row ${on ? 'on' : ''} ${layer.hidden ? 'is-hidden' : ''} ${
                  dropIndex === index && dragId !== layer.id ? 'drop-target' : ''
                }`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData(DRAG_TYPE, layer.id)
                  setDragId(layer.id)
                }}
                onDragOver={(e) => {
                  if (!dragId) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDropIndex(index)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData(DRAG_TYPE)
                  if (id) onReorder(id, index)
                  setDragId(null)
                  setDropIndex(null)
                }}
                onDragEnd={() => {
                  setDragId(null)
                  setDropIndex(null)
                }}
              >
                <span className="layer-grip" aria-hidden="true">
                  <Icon name="grip" size={14} />
                </span>
                <button
                  type="button"
                  className="layer-row-main"
                  aria-current={on ? 'true' : undefined}
                  title="Select. Drag, or Alt + arrow keys, to restack"
                  onClick={() => onSelect(layer.id)}
                  onKeyDown={(e) => onRowKeyDown(e, layer, index)}
                >
                  <LayerThumb layer={layer} />
                  <span className="layer-row-text">
                    <span className="layer-row-name">{layer.name}</span>
                    <span className={`layer-row-note ${note.warn ? 'is-warn' : ''}`}>
                      {note.warn ? <Icon name="alert" size={12} /> : null}
                      {note.text}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="layer-row-btn"
                  aria-label={`${layer.hidden ? 'Show' : 'Hide'} ${layer.name}`}
                  title={layer.hidden ? 'Show' : 'Hide'}
                  aria-pressed={!!layer.hidden}
                  onClick={() => onToggleHidden(layer.id)}
                >
                  <Icon name={layer.hidden ? 'eye-off' : 'eye'} size={15} />
                </button>
                <button
                  type="button"
                  className={`layer-row-btn ${layer.locked ? 'is-set' : ''}`}
                  aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}
                  title={layer.locked ? 'Unlock' : 'Lock, so it can’t be moved on the canvas'}
                  aria-pressed={!!layer.locked}
                  onClick={() => onToggleLocked(layer.id)}
                >
                  <Icon name={layer.locked ? 'lock' : 'unlock'} size={15} />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="studio-empty">Add images and they stack here, top first.</p>
      )}
      <button
        type="button"
        className={`layer-background ${selectedId === null ? 'on' : ''}`}
        title="Background, light leaks and export"
        onClick={() => onSelect(null)}
      >
        <span
          className={`layer-background-swatch ${doc.background ? '' : 'is-transparent'}`}
          style={{ background: doc.background ?? undefined }}
        />
        Background and export
      </button>
    </section>
  )
}

/** Phones: the layers as one row of chips, with Post first for the carousel-wide settings. */
export function LayerChips({ doc, selectedId, onSelect }: Pick<LayersProps, 'doc' | 'selectedId' | 'onSelect'>) {
  return (
    <div className="layer-chips" role="group" aria-label="Layers">
      <button
        type="button"
        className={`layer-chip ${selectedId === null ? 'on' : ''}`}
        aria-pressed={selectedId === null}
        onClick={() => onSelect(null)}
      >
        <span className="layer-chip-icon">
          <Icon name="sliders" size={16} />
        </span>
        Post
      </button>
      {[...doc.layers].reverse().map((layer) => (
        <button
          key={layer.id}
          type="button"
          className={`layer-chip ${layer.id === selectedId ? 'on' : ''} ${layer.hidden ? 'is-hidden' : ''}`}
          aria-pressed={layer.id === selectedId}
          onClick={() => onSelect(layer.id)}
        >
          <LayerThumb layer={layer} />
          {layer.name}
        </button>
      ))}
    </div>
  )
}

type PostProps = {
  doc: CarouselDoc
  onCount: (count: number) => void
  onFormat: (width: number, height: number) => void
}

/** The slide count and format, which shape every slide. */
export function PostPanel({ doc, onCount, onFormat }: PostProps) {
  const format = FORMAT_PRESETS.find((p) => p.width === doc.slideW && p.height === doc.slideH)
  return (
    <section className="studio-panel post-panel" aria-labelledby="post-heading">
      <h2 id="post-heading" className="studio-heading">
        Post
      </h2>
      <div className="post-fields">
        <span id="post-slides">Slides</span>
        <span className="stepper" role="group" aria-labelledby="post-slides">
          <button type="button" aria-label="One fewer slide" disabled={doc.count <= 1} onClick={() => onCount(doc.count - 1)}>
            <Icon name="minus" size={14} />
          </button>
          <output>{doc.count}</output>
          <button
            type="button"
            aria-label="One more slide"
            disabled={doc.count >= MAX_SLIDES}
            onClick={() => onCount(doc.count + 1)}
          >
            <Icon name="plus" size={14} />
          </button>
        </span>
        <label htmlFor="post-format">Format</label>
        <select
          id="post-format"
          value={format?.id ?? ''}
          onChange={(e) => {
            const p = FORMAT_PRESETS.find((f) => f.id === e.target.value)
            if (p) onFormat(p.width, p.height)
          }}
        >
          {format ? null : (
            <option value="" disabled>
              {doc.slideW} × {doc.slideH}
            </option>
          )}
          {FORMAT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} · {p.name}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
