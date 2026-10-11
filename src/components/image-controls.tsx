import { useRef } from 'react'
import { isLowRes, layerUpscale } from '../lib/carousel'
import { OUTLINE_MAX } from '../lib/layer-effects'
import { imageFiles } from '../lib/load-image'
import type { FitMode, Layer, LayerOutline, LayerShadow } from '../types'
import { Icon, type IconName } from './icons'

/** What "Cut out" does with the subject: replace the photo, add it above, or add it over a blur. */
export type CutoutMode = 'replace' | 'layer' | 'portrait'

export type EffectsPatch = Partial<Pick<Layer, 'outline' | 'shadow' | 'blur'>>

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
  onDuplicate: () => void
  onCutout: (mode: CutoutMode) => void
  /** True while a cutout is being made, which disables the cutout actions. */
  removingBackground: boolean
  /** `coalesce` names a slider or picker, so dragging it is one undo step. */
  onEffects: (patch: EffectsPatch, coalesce?: string) => void
  onForward: () => void
  onBackward: () => void
  onDelete: () => void
}

const FIT_OPTIONS: { value: FitMode; label: string; hint: string }[] = [
  { value: 'fill', label: 'Fill slides', hint: 'Cover every slide; rescales when you change slides or format' },
  { value: 'fit', label: 'Fit', hint: 'Show the whole photo across the slides' },
  { value: 'free', label: 'Free', hint: 'Fit inside one slide, then place it anywhere' },
]

const CUTOUT_OPTIONS: { mode: CutoutMode; icon: IconName; label: string; hint: string }[] = [
  { mode: 'replace', icon: 'cutout', label: 'Remove background', hint: 'Swap the photo for its subject' },
  { mode: 'layer', icon: 'layers', label: 'Cut out to new layer', hint: 'Keep the photo, with the subject on top' },
  { mode: 'portrait', icon: 'aperture', label: 'Portrait', hint: 'Blur the photo behind a sharp subject' },
]

const DEFAULT_OUTLINE: LayerOutline = { color: '#ffffff', width: 12 }
const DEFAULT_SHADOW: LayerShadow = { color: '#000000', blur: 24, offsetX: 0, offsetY: 12, opacity: 0.35 }
const MAX_BLUR = 60

function ToolButton({
  icon,
  label,
  onClick,
  danger,
  pressed,
  disabled,
}: {
  icon: IconName
  label: string
  onClick: () => void
  danger?: boolean
  pressed?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`tool-btn ${danger ? 'danger' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
      <span className="tool-btn-label">{label}</span>
    </button>
  )
}

function px(n: number): string {
  return Math.round(n).toLocaleString()
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
  onDuplicate,
  onCutout,
  removingBackground,
  onEffects,
  onForward,
  onBackward,
  onDelete,
}: Props) {
  const replaceRef = useRef<HTMLInputElement>(null)
  const cutoutMenuRef = useRef<HTMLDetailsElement>(null)
  const isSheet = variant === 'sheet'

  const lowRes = isLowRes(layer)
  const lowResDetail =
    `This photo is ${px(layer.naturalWidth)} × ${px(layer.naturalHeight)} px but is stretched to ` +
    `${px(layer.width)} × ${px(layer.height)} px, so it will look soft when exported. ` +
    'Zoom it out or use a larger photo.'

  const cutoutLabel = removingBackground ? 'Removing background…' : 'Cut out'
  const cutoutActions = CUTOUT_OPTIONS.map((o) => (
    <button
      key={o.mode}
      type="button"
      className="tool-btn tool-menu-item"
      title={o.hint}
      disabled={removingBackground}
      onClick={() => {
        if (cutoutMenuRef.current) cutoutMenuRef.current.open = false
        onCutout(o.mode)
      }}
    >
      <Icon name={o.icon} />
      <span className="tool-menu-text">
        <span>{o.label}</span>
        {isSheet ? null : <small>{o.hint}</small>}
      </span>
    </button>
  ))

  const { outline, shadow } = layer
  const blur = layer.blur ?? 0
  const effects = (
    <>
      <div className="effect-group">
        <label className="check-line">
          <input
            type="checkbox"
            checked={!!outline}
            onChange={(e) => onEffects({ outline: e.target.checked ? DEFAULT_OUTLINE : undefined })}
          />
          Outline
        </label>
        {outline ? (
          <>
            <label className="range-field">
              <span>Width</span>
              <input
                type="range"
                min={1}
                max={OUTLINE_MAX}
                step={1}
                value={Math.min(OUTLINE_MAX, outline.width)}
                onChange={(e) => onEffects({ outline: { ...outline, width: Number(e.target.value) } }, 'outline-width')}
              />
              <output>{Math.round(outline.width)} px</output>
            </label>
            <label className="range-field color-field">
              <span>Color</span>
              <input
                type="color"
                value={outline.color}
                onChange={(e) => onEffects({ outline: { ...outline, color: e.target.value } }, 'outline-color')}
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="effect-group">
        <label className="check-line">
          <input
            type="checkbox"
            checked={!!shadow}
            onChange={(e) => onEffects({ shadow: e.target.checked ? DEFAULT_SHADOW : undefined })}
          />
          Shadow
        </label>
        {shadow ? (
          <>
            <label className="range-field">
              <span>Softness</span>
              <input
                type="range"
                min={0}
                max={80}
                step={1}
                value={shadow.blur}
                onChange={(e) => onEffects({ shadow: { ...shadow, blur: Number(e.target.value) } }, 'shadow-blur')}
              />
              <output>{Math.round(shadow.blur)} px</output>
            </label>
            <label className="range-field">
              <span>Offset</span>
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                value={shadow.offsetY}
                onChange={(e) => onEffects({ shadow: { ...shadow, offsetY: Number(e.target.value) } }, 'shadow-offset')}
              />
              <output>{Math.round(shadow.offsetY)} px</output>
            </label>
            <label className="range-field">
              <span>Strength</span>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={shadow.opacity}
                onChange={(e) =>
                  onEffects({ shadow: { ...shadow, opacity: Number(e.target.value) } }, 'shadow-opacity')
                }
              />
              <output>{Math.round(shadow.opacity * 100)}%</output>
            </label>
          </>
        ) : null}
      </div>

      <label className="range-field">
        <span>Blur</span>
        <input
          type="range"
          min={0}
          max={MAX_BLUR}
          step={1}
          value={Math.min(MAX_BLUR, blur)}
          onChange={(e) => onEffects({ blur: Number(e.target.value) || undefined }, 'blur')}
        />
        <output>{Math.round(blur)} px</output>
      </label>
    </>
  )

  return (
    <div className={`image-controls is-${variant}`} role="toolbar" aria-label={`Edit ${layer.name}`}>
      <span className="image-controls-name" title={layer.name}>
        {layer.name}
      </span>

      {lowRes ? (
        <span className="low-res-note" title={lowResDetail}>
          <Icon name="alert" size={14} />
          <span>
            Low resolution · {layerUpscale(layer).toFixed(1)}×{isSheet ? <small>{lowResDetail}</small> : null}
          </span>
        </span>
      ) : null}

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
        <ToolButton icon="copy" label="Duplicate" onClick={onDuplicate} />
        {isSheet ? (
          cutoutActions
        ) : (
          <>
            <details ref={cutoutMenuRef} className="popover tool-popover">
              <summary className="tool-btn" title={cutoutLabel} aria-label={cutoutLabel}>
                <Icon name="cutout" />
              </summary>
              <div className="popover-panel tool-menu">{cutoutActions}</div>
            </details>
            <details className="popover tool-popover">
              <summary className="tool-btn" title="Effects" aria-label="Effects">
                <Icon name="sparkle" />
              </summary>
              <div className="popover-panel effects-panel">{effects}</div>
            </details>
          </>
        )}
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

      {isSheet ? (
        <div className="control-fields effects-fields">
          <span className="control-label">Effects</span>
          {effects}
        </div>
      ) : null}
    </div>
  )
}
