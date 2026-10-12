import { useRef } from 'react'
import { isLowRes, layerUpscale } from '../lib/carousel'
import { FILM_LOOKS, isNeutralLook, NEUTRAL_LOOK, withFilm } from '../lib/film-looks'
import { lookSwatch, OUTLINE_MAX } from '../lib/layer-effects'
import { imageFiles } from '../lib/load-image'
import type { FilmLookId, FitMode, Layer, LayerLook, LayerOutline, LayerShadow } from '../types'
import { Icon, type IconName } from './icons'

/** What "Cut out" does with the subject: replace the photo, add it above, or add it over a blur. */
export type CutoutMode = 'replace' | 'layer' | 'portrait'

export type EffectsPatch = Partial<Pick<Layer, 'outline' | 'shadow' | 'blur' | 'look'>>

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
  /** Start tapping the subject to cut out, for a photo with more than one. */
  onChooseSubject: () => void
  /** True while a cutout is being made, which disables the cutout actions. */
  removingBackground: boolean
  /** How many of this image's faces a slide edge runs through. */
  facesOnEdge: number
  /** Move the image just enough to take its faces off the slide edges. */
  onNudge: () => void
  /** `coalesce` names a slider or picker, so dragging it is one undo step. */
  onEffects: (patch: EffectsPatch, coalesce?: string) => void
  /** Give every photo this one's look. Left out when there's only one photo. */
  onLookToAll?: () => void
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

const LOOK_CHOICES: { id: FilmLookId | null; name: string }[] = [{ id: null, name: 'None' }, ...FILM_LOOKS]

type LookSlider = Exclude<keyof LayerLook, 'film'>

/** Sliders from 0 are percentages; sliders from -1 are signed, with 0 in the middle. */
const FILM_SLIDERS: { key: LookSlider; label: string; min: number }[] = [
  { key: 'grain', label: 'Grain', min: 0 },
  { key: 'vignette', label: 'Vignette', min: 0 },
]
const ADJUST_SLIDERS: { key: LookSlider; label: string; min: number }[] = [
  { key: 'brightness', label: 'Brightness', min: -1 },
  { key: 'contrast', label: 'Contrast', min: -1 },
  { key: 'saturation', label: 'Saturation', min: -1 },
  { key: 'warmth', label: 'Warmth', min: -1 },
]

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
  onChooseSubject,
  removingBackground,
  facesOnEdge,
  onNudge,
  onEffects,
  onLookToAll,
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

  const faceDetail =
    'A slide edge runs through this face, so it will look cut in half when the post is seen one slide ' +
    'at a time. Nudge moves the photo just enough to clear it.'

  const cutoutLabel = removingBackground ? 'Removing background…' : 'Cut out'
  const menuItem = (key: string, icon: IconName, label: string, hint: string, onClick: () => void) => (
    <button
      key={key}
      type="button"
      className="tool-btn tool-menu-item"
      title={hint}
      disabled={removingBackground}
      onClick={() => {
        if (cutoutMenuRef.current) cutoutMenuRef.current.open = false
        onClick()
      }}
    >
      <Icon name={icon} />
      <span className="tool-menu-text">
        <span>{label}</span>
        {isSheet ? null : <small>{hint}</small>}
      </span>
    </button>
  )
  const cutoutActions = [
    ...CUTOUT_OPTIONS.map((o) => menuItem(o.mode, o.icon, o.label, o.hint, () => onCutout(o.mode))),
    menuItem('choose', 'target', 'Choose subject…', 'Tap the one to cut out, when there are several', onChooseSubject),
  ]

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

  const look = layer.look ?? NEUTRAL_LOOK
  const setLook = (next: LayerLook, coalesce?: string) =>
    onEffects({ look: isNeutralLook(next) ? undefined : next }, coalesce)
  const lookSlider = ({ key, label, min }: { key: LookSlider; label: string; min: number }) => {
    const value = Math.round(look[key] * 100)
    return (
      <label key={key} className="range-field">
        <span>{label}</span>
        <input
          type="range"
          min={min}
          max={1}
          step={0.01}
          value={look[key]}
          onChange={(e) => setLook({ ...look, [key]: Number(e.target.value) }, `look-${key}`)}
        />
        <output>{min < 0 ? `${value > 0 ? '+' : ''}${value}` : `${value}%`}</output>
      </label>
    )
  }
  const looks = (
    <>
      <div className="look-swatches" role="radiogroup" aria-label="Film look">
        {LOOK_CHOICES.map((c) => (
          <button
            key={c.id ?? 'none'}
            type="button"
            role="radio"
            aria-checked={look.film === c.id}
            className={`look-swatch ${look.film === c.id ? 'on' : ''}`}
            onClick={() => {
              if (look.film !== c.id) setLook(withFilm(look, c.id))
            }}
          >
            <img src={lookSwatch(layer, c.id)} alt="" width={60} height={60} />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      {look.film ? lookSlider({ key: 'strength', label: 'Strength', min: 0 }) : null}
      {FILM_SLIDERS.map(lookSlider)}
      <span className="look-heading">Adjust</span>
      {ADJUST_SLIDERS.map(lookSlider)}
      <div className="look-actions">
        {onLookToAll ? (
          <button
            type="button"
            className="look-btn"
            title="Give every photo in the carousel this look"
            disabled={!layer.look}
            onClick={onLookToAll}
          >
            Apply to all photos
          </button>
        ) : null}
        <button type="button" className="look-btn" disabled={!layer.look} onClick={() => onEffects({ look: undefined })}>
          Reset
        </button>
      </div>
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

      {facesOnEdge ? (
        <span className="low-res-note" title={faceDetail}>
          <Icon name="alert" size={14} />
          <span>
            {facesOnEdge === 1 ? 'Face on a slide edge' : `${facesOnEdge} faces on slide edges`}
            {isSheet ? <small>{faceDetail}</small> : null}
          </span>
          <button type="button" className="note-btn" onClick={onNudge}>
            Nudge
          </button>
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
              <summary className="tool-btn" title="Look" aria-label="Look">
                <Icon name="look" />
              </summary>
              <div className="popover-panel effects-panel look-panel">{looks}</div>
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
        <>
          <div className="control-fields effects-fields">
            <span className="control-label">Look</span>
            {looks}
          </div>
          <div className="control-fields effects-fields">
            <span className="control-label">Effects</span>
            {effects}
          </div>
        </>
      ) : null}
    </div>
  )
}

type PickerProps = {
  variant: 'toolbar' | 'sheet'
  /** Loading or working text; null while it waits for taps. */
  status: string | null
  /** Taps so far. */
  points: number
  /** True once there's a subject to cut out. */
  canConfirm: boolean
  onUndo: () => void
  onCancel: () => void
  onConfirm: (mode: CutoutMode) => void
}

/** Shown in place of the image controls while the subject to cut out is being tapped. */
export function SubjectPicker({ variant, status, points, canConfirm, onUndo, onCancel, onConfirm }: PickerProps) {
  const hint = points
    ? 'Tap to add more. Shift-click or long-press takes a part away.'
    : 'Tap the subject you want to keep.'
  return (
    <div className={`image-controls subject-picker is-${variant}`} role="toolbar" aria-label="Choose subject">
      <span className="picker-hint" aria-live="polite">
        {status ?? hint}
      </span>
      <div className="tool-row">
        <ToolButton icon="undo" label="Undo tap" onClick={onUndo} disabled={!points} />
        <ToolButton icon="close" label="Cancel" onClick={onCancel} />
      </div>
      <div className="tool-row">
        {CUTOUT_OPTIONS.map((o) => (
          <button
            key={o.mode}
            type="button"
            className="picker-action"
            title={o.hint}
            disabled={!canConfirm}
            onClick={() => onConfirm(o.mode)}
          >
            <Icon name={o.icon} />
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
