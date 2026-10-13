import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isLowRes, layerUpscale } from '../lib/carousel'
import { getImage } from '../lib/image-registry'
import { CUTOUT_OPTIONS, FIT_OPTIONS } from '../lib/layer-options'
import { IMAGE_ACCEPT, listFiles } from '../lib/load-image'
import type { Layer } from '../types'
import { Icon } from './icons'
import { EffectsFields, ImageControls, LookFields, type ImageControlsProps } from './image-controls'

type Section = 'arrange' | 'cutout' | 'look' | 'effects' | 'checks'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'arrange', label: 'Arrange' },
  { id: 'cutout', label: 'Cut out' },
  { id: 'look', label: 'Look' },
  { id: 'effects', label: 'Effects' },
  { id: 'checks', label: 'Checks' },
]

const OPEN_KEY = 'stitcher.studio.sections'
const DEFAULT_OPEN: Section[] = ['arrange', 'checks']

/** Which sections are open is a convenience, so a browser that blocks storage gets the defaults. */
function readOpen(): Section[] {
  try {
    const stored = JSON.parse(localStorage.getItem(OPEN_KEY) ?? 'null') as unknown
    return Array.isArray(stored) ? stored.filter((s): s is Section => SECTIONS.some((x) => x.id === s)) : DEFAULT_OPEN
  } catch {
    return DEFAULT_OPEN
  }
}

type BoxPatch = Partial<Pick<Layer, 'x' | 'y' | 'width' | 'height'>>

type StudioExtras = {
  onBox: (patch: BoxPatch) => void
  onToggleHidden: () => void
  onToggleLocked: () => void
}

type Props = Omit<ImageControlsProps, 'variant' | 'detail' | 'onDetail' | 'layers' | 'onSelectLayer'> &
  StudioExtras & {
    /** `panel` is Studio's right column on desktop, with sections; `sheet` is the phone's tabbed sheet. */
    variant: 'panel' | 'sheet'
  }

/**
 * The selected layer's controls: Quick's toolbar (or phone sheet), or Studio's inspector. One
 * element in the editor feeds both, so they always do the same things.
 */
export function LayerControls({
  studio,
  phone,
  onBox,
  onToggleHidden,
  onToggleLocked,
  ...rest
}: Omit<ImageControlsProps, 'variant'> & StudioExtras & { studio: boolean; phone: boolean }) {
  return studio ? (
    <Inspector
      {...rest}
      variant={phone ? 'sheet' : 'panel'}
      onBox={onBox}
      onToggleHidden={onToggleHidden}
      onToggleLocked={onToggleLocked}
    />
  ) : (
    <ImageControls
      {...rest}
      variant={phone ? 'sheet' : 'toolbar'}
      onToggleHidden={onToggleHidden}
      onToggleLocked={onToggleLocked}
    />
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="num-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={Math.round(value)}
        onChange={(e) => {
          const n = e.target.valueAsNumber
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </label>
  )
}

/** Studio's controls for the selected layer. */
export function Inspector(props: Props) {
  const {
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
    onForward,
    onBackward,
    onDelete,
    onBox,
    onToggleHidden,
    onToggleLocked,
  } = props
  const replaceRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<Section[]>(readOpen)
  const [tab, setTab] = useState<Section>('arrange')

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(open))
    } catch {
      // A browser that blocks storage just won't remember the choice.
    }
  }, [open])

  const lowRes = !layer.hidden && isLowRes(layer)
  const warnings = (lowRes ? 1 : 0) + (facesOnEdge ? 1 : 0)
  const ratio = layer.height / layer.width

  const arrange = (
    <div className="inspector-fields">
      <div className="segmented inspector-fit" role="group" aria-label="Fit">
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
      <div className="num-grid">
        <NumberField label="X" value={layer.x} onChange={(x) => onBox({ x })} />
        <NumberField label="Y" value={layer.y} onChange={(y) => onBox({ y })} />
        <NumberField
          label="W"
          value={layer.width}
          onChange={(w) => {
            const width = Math.max(8, w)
            onBox(layer.lockAspect ? { width, height: width * ratio } : { width })
          }}
        />
        <NumberField
          label="H"
          value={layer.height}
          onChange={(h) => {
            const height = Math.max(8, h)
            onBox(layer.lockAspect ? { height, width: height / ratio } : { height })
          }}
        />
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
      <div className="inspector-buttons">
        <button type="button" className="btn btn-outline" onClick={onRotate90}>
          <Icon name="rotate" size={16} />
          90°
        </button>
        <button type="button" className="btn btn-outline" aria-pressed={layer.flipX} onClick={onFlip}>
          <Icon name="flip" size={16} />
          Flip
        </button>
        <button
          type="button"
          className="btn btn-outline"
          aria-pressed={layer.lockAspect}
          title="Keep the shape when resizing"
          onClick={onToggleLock}
        >
          <Icon name={layer.lockAspect ? 'lock' : 'unlock'} size={16} />
          Aspect
        </button>
      </div>
      <div className="inspector-buttons">
        <button type="button" className="btn btn-outline" onClick={onForward}>
          <Icon name="forward" size={16} />
          Forward
        </button>
        <button type="button" className="btn btn-outline" onClick={onBackward}>
          <Icon name="backward" size={16} />
          Backward
        </button>
        <button type="button" className="btn btn-outline" onClick={() => replaceRef.current?.click()}>
          <Icon name="replace" size={16} />
          Replace
        </button>
      </div>
    </div>
  )

  const cutout = (
    <div className="inspector-fields">
      <div className="cutout-grid">
        {CUTOUT_OPTIONS.map((o) => (
          <button
            key={o.mode}
            type="button"
            className="cutout-btn"
            disabled={removingBackground}
            onClick={() => onCutout(o.mode)}
          >
            <Icon name={o.icon} size={18} />
            <strong>{o.label}</strong>
            <span>{o.hint}</span>
          </button>
        ))}
        <button type="button" className="cutout-btn" disabled={removingBackground} onClick={onChooseSubject}>
          <Icon name="target" size={18} />
          <strong>Choose subject</strong>
          <span>Tap the one to keep, when there are several</span>
        </button>
      </div>
      {removingBackground ? <p className="inspector-note">Removing the background…</p> : null}
    </div>
  )

  const look = (
    <div className="inspector-fields control-fields effects-fields">
      <LookFields layer={layer} onEffects={props.onEffects} onLookToAll={props.onLookToAll} />
    </div>
  )

  const effects = (
    <div className="inspector-fields control-fields effects-fields">
      <EffectsFields layer={layer} onEffects={props.onEffects} onDateStampOn={props.onDateStampOn} />
    </div>
  )

  const checks = (
    <div className="inspector-fields">
      {lowRes ? (
        <p className="check-card is-warn">
          <Icon name="alert" size={16} />
          <span>
            <strong>{layer.name}</strong> is stretched {layerUpscale(layer).toFixed(1)}× and will look soft. Make it
            smaller, or use a bigger photo.
          </span>
        </p>
      ) : null}
      {facesOnEdge ? (
        <p className="check-card is-warn">
          <Icon name="alert" size={16} />
          <span>
            A slide edge runs through {facesOnEdge === 1 ? 'a face' : `${facesOnEdge} faces`}, so it will look cut
            in half as people swipe.
          </span>
          <button type="button" className="btn btn-outline" onClick={onNudge}>
            Nudge
          </button>
        </p>
      ) : null}
      {layer.hidden ? (
        <p className="check-card">
          <Icon name="eye-off" size={16} />
          <span>Hidden, so it won’t be exported.</span>
        </p>
      ) : null}
      {!warnings && !layer.hidden ? (
        <p className="check-card is-ok">
          <Icon name="check" size={16} />
          <span>Nothing to fix</span>
        </p>
      ) : null}
    </div>
  )

  const bodies: Record<Section, ReactNode> = { arrange, cutout, look, effects, checks }
  const badge = (id: Section) =>
    id === 'checks' && warnings ? <span className="inspector-badge">{warnings}</span> : null
  const img = getImage(layer.imageId)

  return (
    <div className={`inspector is-${variant}`} role="region" aria-label={`Edit ${layer.name}`}>
      <div className="inspector-head">
        <span className="layer-thumb is-transparent">{img ? <img src={img.url} alt="" /> : null}</span>
        <span className="inspector-title">
          <strong>{layer.name}</strong>
          <span>
            {layer.naturalWidth.toLocaleString()} × {layer.naturalHeight.toLocaleString()} px
          </span>
        </span>
        {/* On desktop the layer list has these; the phone's chips don't. */}
        {variant === 'sheet' ? (
          <>
            <button
              type="button"
              className="icon-btn"
              aria-label={layer.hidden ? 'Show' : 'Hide'}
              title={layer.hidden ? 'Show' : 'Hide'}
              aria-pressed={!!layer.hidden}
              onClick={onToggleHidden}
            >
              <Icon name={layer.hidden ? 'eye-off' : 'eye'} size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={layer.locked ? 'Unlock' : 'Lock'}
              title={layer.locked ? 'Unlock' : 'Lock, so it can’t be moved on the canvas'}
              aria-pressed={!!layer.locked}
              onClick={onToggleLocked}
            >
              <Icon name={layer.locked ? 'lock' : 'unlock'} size={16} />
            </button>
          </>
        ) : null}
        <button type="button" className="icon-btn" aria-label="Duplicate (Ctrl+D)" title="Duplicate (Ctrl+D)" onClick={onDuplicate}>
          <Icon name="copy" size={16} />
        </button>
        <button type="button" className="icon-btn" aria-label="Delete" title="Delete" onClick={onDelete}>
          <Icon name="trash" size={16} />
        </button>
      </div>
      <input
        ref={replaceRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => {
          const [file] = listFiles(e.target.files)
          if (file) onReplace(file)
          e.target.value = ''
        }}
      />

      {variant === 'panel' ? (
        SECTIONS.map((s) => {
          const isOpen = open.includes(s.id)
          return (
            <section key={s.id} className="inspector-section">
              <button
                type="button"
                className="inspector-section-head"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => (isOpen ? o.filter((x) => x !== s.id) : [...o, s.id]))}
              >
                <span>{s.label}</span>
                {badge(s.id)}
                <Icon name="chevron-down" size={16} />
              </button>
              {isOpen ? bodies[s.id] : null}
            </section>
          )
        })
      ) : (
        <>
          <div className="inspector-tabs" role="tablist" aria-label="Inspector">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                id={`inspector-tab-${s.id}`}
                aria-selected={tab === s.id}
                aria-controls="inspector-tabpanel"
                className={tab === s.id ? 'on' : ''}
                onClick={() => setTab(s.id)}
              >
                {s.label}
                {badge(s.id)}
              </button>
            ))}
          </div>
          <div id="inspector-tabpanel" role="tabpanel" aria-labelledby={`inspector-tab-${tab}`}>
            {bodies[tab]}
          </div>
        </>
      )}
    </div>
  )
}
