import { useRef, useState } from 'react'
import type { GifDoc } from '../lib/gif-doc'
import { getImage } from '../lib/image-registry'
import { imageFiles } from '../lib/load-image'
import { Icon } from './icons'

type Props = {
  doc: GifDoc
  activeIndex: number
  onSelect: (index: number) => void
  onAddFiles: (files: File[]) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onReorder: (from: number, to: number) => void
}

/** The frames in playback order. Drag a thumbnail to move it. */
export function FrameStrip({
  doc,
  activeIndex,
  onSelect,
  onAddFiles,
  onRemove,
  onDuplicate,
  onReorder,
}: Props) {
  const addRef = useRef<HTMLInputElement>(null)
  const dragFrom = useRef<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const pad = Math.max(2, String(doc.frames.length).length)

  const finishDrag = () => {
    dragFrom.current = null
    setDropAt(null)
  }

  return (
    <nav className="slide-strip frame-strip" aria-label="Frames">
      <div className="slide-strip-head">
        <strong>Your frames</strong>
        <span>
          {doc.frames.length
            ? `Plays ${doc.reverse ? 'right to left' : 'left to right'} — drag to reorder`
            : 'Add images to build the loop'}
        </span>
      </div>
      <ol className="slide-strip-list">
        {doc.frames.map((f, i) => (
          <li
            key={f.id}
            className={`slide-strip-item frame-item ${i === activeIndex ? 'active' : ''} ${
              dropAt === i ? 'drop-target' : ''
            }`}
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
              aria-label={`Frame ${i + 1}: ${f.name}`}
              aria-current={i === activeIndex ? 'true' : undefined}
              onClick={() => onSelect(i)}
            >
              <span
                className="slide-thumb-frame"
                style={{
                  background: doc.background,
                  aspectRatio: `${f.naturalWidth} / ${f.naturalHeight}`,
                }}
              >
                <img src={getImage(f.imageId)?.url} alt="" />
              </span>
              <span className="slide-thumb-num">{String(i + 1).padStart(pad, '0')}</span>
            </button>
            <div className="frame-thumb-actions">
              <button
                type="button"
                className="slide-thumb-remove"
                aria-label={`Duplicate frame ${i + 1}`}
                title="Duplicate frame"
                onClick={() => onDuplicate(f.id)}
              >
                <Icon name="copy" size={12} />
              </button>
              <button
                type="button"
                className="slide-thumb-remove"
                aria-label={`Remove frame ${i + 1}`}
                title="Remove frame"
                onClick={() => onRemove(f.id)}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          </li>
        ))}
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
            aria-label="Add frames"
            title="Add frames"
            onClick={() => addRef.current?.click()}
          >
            <Icon name="plus" />
          </button>
        </li>
      </ol>
    </nav>
  )
}
