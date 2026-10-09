import { useRef, useState } from 'react'
import type { CollageDoc } from '../lib/collage'
import { getImage } from '../lib/image-registry'
import { imageFiles } from '../lib/load-image'
import { Icon } from './icons'

type Props = {
  doc: CollageDoc
  activeIndex: number
  /** The item whose background is being removed right now. */
  cuttingId: string | null
  onSelect: (index: number) => void
  onAddFiles: (files: File[]) => void
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onReorder: (from: number, to: number) => void
}

/** The photos in stacking order, each shown as its cutout once it's ready. Drag to reorder. */
export function CollageStrip({
  doc,
  activeIndex,
  cuttingId,
  onSelect,
  onAddFiles,
  onRemove,
  onRetry,
  onReorder,
}: Props) {
  const addRef = useRef<HTMLInputElement>(null)
  const dragFrom = useRef<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const pad = Math.max(2, String(doc.items.length).length)

  const finishDrag = () => {
    dragFrom.current = null
    setDropAt(null)
  }

  return (
    <nav className="slide-strip frame-strip" aria-label="Photos">
      <div className="slide-strip-head">
        <strong>Your photos</strong>
        <span>
          {doc.items.length
            ? 'Subjects stack in this order — drag to reorder'
            : 'Add photos to build the collage'}
        </span>
      </div>
      <ol className="slide-strip-list">
        {doc.items.map((item, i) => {
          const cutoutUrl = item.cutoutId ? getImage(item.cutoutId)?.url : undefined
          const status = item.failed
            ? 'Failed'
            : item.cutoutId
              ? null
              : item.id === cuttingId
                ? 'Cutting out'
                : 'Waiting'
          return (
            <li
              key={item.id}
              className={`slide-strip-item frame-item ${i === activeIndex ? 'active' : ''} ${
                dropAt === i ? 'drop-target' : ''
              } ${item.id === cuttingId ? 'is-cutting' : ''}`}
              draggable
              onDragStart={(e) => {
                dragFrom.current = i
                e.dataTransfer.effectAllowed = 'move'
                // Marks this as a reorder so the editor's file-drop overlay ignores it.
                e.dataTransfer.setData('text/x-stitcher-frame', String(i))
              }}
              onDragOver={(e) => {
                if (dragFrom.current === null) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDropAt(i)
              }}
              onDrop={(e) => {
                if (dragFrom.current === null) return
                e.preventDefault()
                e.stopPropagation()
                onReorder(dragFrom.current, i)
                finishDrag()
              }}
              onDragEnd={finishDrag}
            >
              <button
                type="button"
                className="slide-thumb"
                aria-label={`Photo ${i + 1}: ${item.name}${status ? ` (${status.toLowerCase()})` : ''}`}
                aria-current={i === activeIndex ? 'true' : undefined}
                onClick={() => onSelect(i)}
              >
                <span
                  className="slide-thumb-frame"
                  style={{
                    background: doc.overlay,
                    aspectRatio: `${item.naturalWidth} / ${item.naturalHeight}`,
                  }}
                >
                  <img src={cutoutUrl ?? getImage(item.imageId)?.url} alt="" />
                </span>
                <span className="slide-thumb-num">{String(i + 1).padStart(pad, '0')}</span>
                {status ? (
                  <span className={`collage-thumb-status ${item.failed ? 'is-failed' : ''}`}>{status}</span>
                ) : null}
              </button>
              <div className="frame-thumb-actions">
                {item.failed ? (
                  <button
                    type="button"
                    className="slide-thumb-remove collage-retry"
                    aria-label={`Retry the cutout of photo ${i + 1}`}
                    title="Retry the cutout"
                    onClick={() => onRetry(item.id)}
                  >
                    <Icon name="rotate" size={12} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="slide-thumb-remove"
                  aria-label={`Remove photo ${i + 1}`}
                  title="Remove photo"
                  onClick={() => onRemove(item.id)}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            </li>
          )
        })}
        <li>
          <input
            ref={addRef}
            type="file"
            accept="image/*"
            multiple
            className="visually-hidden"
            tabIndex={-1}
            onChange={(e) => {
              const files = imageFiles(e.target.files)
              if (files.length) onAddFiles(files)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className="slide-add frame-add"
            aria-label="Add photos"
            title="Add photos"
            onClick={() => addRef.current?.click()}
          >
            <Icon name="plus" />
          </button>
        </li>
      </ol>
    </nav>
  )
}
