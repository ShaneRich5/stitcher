import { useState } from 'react'
import { cutoutState, itemStartMs, type CollageDoc, type CutoutState } from '../lib/collage'
import { getImage } from '../lib/image-registry'
import type { CollageItem } from '../types'
import { Icon } from './icons'

const STATUS: Record<CutoutState, string> = {
  ready: 'Cut out',
  cutting: 'Cutting out the subject…',
  waiting: 'Waiting to be cut out',
  failed: 'No subject found',
}

/** A photo's thumbnail, on the overlay color it fades in over. */
export function PhotoThumb({ item, background }: { item: CollageItem; background: string }) {
  const photo = getImage(item.imageId)?.url
  return (
    <span className="photo-thumb" style={{ background }}>
      {photo ? <img src={photo} alt="" /> : null}
    </span>
  )
}

type Props = {
  doc: CollageDoc
  selectedId: string | null
  /** The item whose background is being removed right now. */
  cuttingId: string | null
  onSelect: (index: number) => void
  onReorder: (from: number, to: number) => void
  onRetry: (id: string) => void
}

/** The photos in stacking order, each with where its cutout is up to. Drag a row to reorder. */
export function CollagePhotos({ doc, selectedId, cuttingId, onSelect, onReorder, onRetry }: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const finish = () => {
    setDragFrom(null)
    setDropAt(null)
  }

  if (!doc.items.length) return <p className="studio-empty">Add photos and they stack here, first to last.</p>

  return (
    <ol className="photo-rows">
      {doc.items.map((item, i) => {
        const state = cutoutState(item, cuttingId)
        const on = item.id === selectedId
        return (
          <li
            key={item.id}
            className={`layer-row photo-row ${on ? 'on' : ''} ${dropAt === i && dragFrom !== i ? 'drop-target' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              // Marks this as a reorder so the editor's file-drop overlay ignores it.
              e.dataTransfer.setData('text/x-stitcher-frame', String(i))
              setDragFrom(i)
            }}
            onDragOver={(e) => {
              if (dragFrom === null) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDropAt(i)
            }}
            onDrop={(e) => {
              if (dragFrom === null) return
              e.preventDefault()
              e.stopPropagation()
              onReorder(dragFrom, i)
              finish()
            }}
            onDragEnd={finish}
          >
            <span className="layer-grip" aria-hidden="true">
              <Icon name="grip" size={14} />
            </span>
            <button
              type="button"
              className="layer-row-main"
              aria-current={on ? 'true' : undefined}
              aria-label={`Photo ${i + 1}: ${item.name}, ${STATUS[state].toLowerCase()}`}
              title="Show this photo. Drag to reorder"
              onClick={() => onSelect(i)}
            >
              <PhotoThumb item={item} background={doc.overlay} />
              <span className="layer-row-text">
                <span className="layer-row-name">{item.name}</span>
                <span className={`layer-row-note photo-status is-${state}`}>
                  {state === 'ready' ? <Icon name="check" size={12} /> : null}
                  {state === 'failed' ? <Icon name="alert" size={12} /> : null}
                  {STATUS[state]}
                  {state === 'cutting' ? <span className="photo-progress" aria-hidden="true" /> : null}
                </span>
              </span>
            </button>
            {state === 'failed' ? (
              <button type="button" className="btn btn-outline photo-retry" onClick={() => onRetry(item.id)}>
                Retry
              </button>
            ) : (
              <span className="photo-at" title="When its subject comes in">
                {(itemStartMs(doc, i) / 1000).toFixed(1)} s
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
