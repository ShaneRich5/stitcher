import { useRef } from 'react'
import { imageFiles } from '../lib/load-image'
import type { FitMode, Layer } from '../types'
import { Icon, type IconName } from './icons'

type Props = {
  layer: Layer
  zoom: number
  /** `toolbar` floats over the canvas on desktop; `sheet` sits in the phone dock. */
  variant: 'toolbar' | 'sheet'
  onFit: (fit: FitMode) => void
  onZoom: (zoom: number) => void
  onRotate: (degrees: number) => void
  onRotate90: () => void
  onFlip: () => void
  onToggleLock: () => void
  onReplace: (file: File) => void
  onForward: () => void
  onBackward: () => void
  onDelete: () => void
}

const FIT_OPTIONS: { value: FitMode; label: string; hint: string }[] = [
  { value: 'fill', label: 'Fill slides', hint: 'Cover every slide; rescales when you change slides or format' },
  { value: 'fit', label: 'Fit', hint: 'Show the whole photo across the slides' },
  { value: 'free', label: 'Free', hint: 'Fit inside one slide, then place it anywhere' },
]

function ToolButton({
  icon,
  label,
  onClick,
  danger,
  pressed,
}: {
  icon: IconName
  label: string
  onClick: () => void
  danger?: boolean
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      className={`tool-btn ${danger ? 'danger' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <Icon name={icon} />
      <span className="tool-btn-label">{label}</span>
    </button>
  )
}

/** Controls for the selected image only. */
export function ImageControls({
  layer,
  zoom,
  variant,
  onFit,
  onZoom,
  onRotate,
  onRotate90,
  onFlip,
  onToggleLock,
  onReplace,
  onForward,
  onBackward,
  onDelete,
}: Props) {
  const replaceRef = useRef<HTMLInputElement>(null)

  return (
    <div className={`image-controls is-${variant}`} role="toolbar" aria-label={`Edit ${layer.name}`}>
      <span className="image-controls-name" title={layer.name}>
        {layer.name}
      </span>

      <div className="segmented" role="group" aria-label="Fit">
        {FIT_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.hint}
            className={`seg-btn ${layer.fit === o.value ? 'on' : ''}`}
            aria-pressed={layer.fit === o.value}
            onClick={() => onFit(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <label className="range-field">
        <span>Zoom</span>
        <input
          type="range"
          min={0.2}
          max={4}
          step={0.01}
          value={Math.min(4, Math.max(0.2, zoom))}
          onChange={(e) => onZoom(Number(e.target.value))}
        />
        <output>{Math.round(zoom * 100)}%</output>
      </label>

      <label className="range-field">
        <span>Rotate</span>
        <input
          type="range"
          min={-180}
          max={180}
          step={1}
          value={Math.round(layer.rotation)}
          onChange={(e) => onRotate(Number(e.target.value))}
        />
        <output>{Math.round(layer.rotation)}°</output>
      </label>

      <div className="tool-row">
        <ToolButton icon="rotate" label="Rotate 90°" onClick={onRotate90} />
        <ToolButton icon="flip" label="Flip" onClick={onFlip} pressed={layer.flipX} />
        <ToolButton
          icon={layer.lockAspect ? 'lock' : 'unlock'}
          label={layer.lockAspect ? 'Aspect locked' : 'Aspect unlocked'}
          onClick={onToggleLock}
          pressed={layer.lockAspect}
        />
        <ToolButton icon="forward" label="Bring forward" onClick={onForward} />
        <ToolButton icon="backward" label="Send backward" onClick={onBackward} />
        <input
          ref={replaceRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          tabIndex={-1}
          onChange={(e) => {
            const [file] = imageFiles(e.target.files)
            if (file) onReplace(file)
            e.target.value = ''
          }}
        />
        <ToolButton icon="replace" label="Replace" onClick={() => replaceRef.current?.click()} />
        <ToolButton icon="trash" label="Delete" onClick={onDelete} danger />
      </div>
    </div>
  )
}
