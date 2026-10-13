import { useRef } from 'react'
import { IMAGE_ACCEPT, listFiles } from '../lib/load-image'
import { Icon, type IconName } from './icons'

/** Select grabs layers; Pan drags the view, as holding Space does. */
export type StudioTool = 'select' | 'pan'

type SoonTool = { icon: IconName; label: string }

type Props = {
  /** Left out for tools with nothing to grab on the canvas, like the GIF and collage previews. */
  tool?: StudioTool
  onTool?: (tool: StudioTool) => void
  onAddFiles: (files: File[]) => void
  /** What the add button says it adds. */
  addLabel?: string
  /** Planned tools, shown so people can see what's coming. */
  soon?: SoonTool[]
}

const SOON: SoonTool[] = [
  { icon: 'text', label: 'Text' },
  { icon: 'shapes', label: 'Shapes and stickers' },
  { icon: 'templates', label: 'Templates' },
]

/** Studio's tool column on the left. */
export function StudioRail({ tool, onTool, onAddFiles, addLabel = 'Add images', soon = SOON }: Props) {
  const addRef = useRef<HTMLInputElement>(null)
  return (
    <nav className="studio-rail" aria-label="Tools">
      {tool && onTool ? (
        <>
          <button
            type="button"
            className="rail-btn"
            aria-label="Select (V)"
            title="Select (V)"
            aria-pressed={tool === 'select'}
            onClick={() => onTool('select')}
          >
            <Icon name="pointer" />
          </button>
          <button
            type="button"
            className="rail-btn"
            aria-label="Pan (H)"
            title="Pan (H), or hold Space"
            aria-pressed={tool === 'pan'}
            onClick={() => onTool('pan')}
          >
            <Icon name="hand" />
          </button>
        </>
      ) : null}
      <input
        ref={addRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => {
          const files = listFiles(e.target.files)
          if (files.length) onAddFiles(files)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        className="rail-btn"
        aria-label={addLabel}
        title={addLabel}
        onClick={() => addRef.current?.click()}
      >
        <Icon name="image" />
      </button>
      <span className="rail-divider" aria-hidden="true" />
      {soon.map((s) => (
        <button
          key={s.icon}
          type="button"
          className="rail-btn is-soon"
          aria-label={`${s.label}, coming soon`}
          title={`${s.label}: coming soon`}
          disabled
        >
          <Icon name={s.icon} />
        </button>
      ))}
    </nav>
  )
}
