import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

/** One stop on the guide: the element marked `data-guide="<target>"`, and what to say about it. */
export type GuideStep = { target: string; title: string; body: string }

type Props = {
  /** Read by screen readers as the guide's name, e.g. "GIF quick guide". */
  label: string
  steps: GuideStep[]
  /** Skipped or finished. */
  onClose: () => void
}

type Box = { top: number; left: number; width: number; height: number }

const CARD_W = 320
const GAP = 14
const MARGIN = 16
/** About how tall the card is, for placing it before it has been measured. */
const CARD_H = 200

function sameBox(a: Box | null, b: Box | null): boolean {
  return (
    a === b ||
    (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)
  )
}

/**
 * A short tour over the example: a card beside each step's target, with a soft ring around it.
 * The page stays live underneath, so people can try what the card describes. A step whose target
 * isn't on screen (another layout, say) shows its card at the bottom instead.
 */
export function QuickGuide({ label, steps, onClose }: Props) {
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const step = steps[index]!
  const last = index === steps.length - 1

  // Follow the target as the layout moves (playback, resizes, scrolling).
  useEffect(() => {
    let frame = 0
    let seen: Box | null = null
    const measure = () => {
      const el = document.querySelector(`[data-guide="${step.target}"]`)
      const r = el?.getBoundingClientRect()
      const next = r && r.width > 0 ? { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) } : null
      if (!sameBox(seen, next)) {
        seen = next
        setBox(next)
      }
      frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [step.target])

  useEffect(() => nextRef.current?.focus(), [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(CARD_W, vw - MARGIN * 2)
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
  let card: CSSProperties
  if (!box) {
    card = { left: (vw - width) / 2, bottom: 24, width }
  } else {
    // Beside the target when there's room, so the card covers none of it; else below or above.
    const right = box.left + box.width + GAP
    const leftOf = box.left - GAP - width
    const top = clamp(box.top + box.height / 2 - CARD_H / 2, MARGIN, vh - CARD_H - MARGIN)
    const centered = clamp(box.left + box.width / 2 - width / 2, MARGIN, vw - width - MARGIN)
    const below = vh - (box.top + box.height)
    if (right + width <= vw - MARGIN) card = { left: right, top, width }
    else if (leftOf >= MARGIN) card = { left: leftOf, top, width }
    else if (below >= CARD_H + GAP || below > box.top) {
      card = { left: centered, top: Math.min(box.top + box.height + GAP, vh - CARD_H - MARGIN), width }
    } else card = { left: centered, bottom: Math.max(MARGIN, vh - box.top + GAP), width }
  }

  return createPortal(
    <>
      {box ? (
        <div
          className="guide-ring"
          aria-hidden="true"
          style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }}
        />
      ) : null}
      <section className="guide-card" role="dialog" aria-label={label} aria-describedby={titleId} style={card}>
        <p className="guide-count">
          {index + 1} of {steps.length}
        </p>
        <h2 id={titleId}>{step.title}</h2>
        <p className="guide-body">{step.body}</p>
        <div className="guide-actions">
          <button type="button" className="guide-skip" onClick={onClose}>
            {last ? 'Close' : 'Skip guide'}
          </button>
          {index > 0 ? (
            <button type="button" className="btn btn-outline" onClick={() => setIndex((i) => i - 1)}>
              Back
            </button>
          ) : null}
          <button
            ref={nextRef}
            type="button"
            className="btn btn-primary"
            onClick={() => (last ? onClose() : setIndex((i) => i + 1))}
          >
            {last ? 'Got it' : 'Next'}
          </button>
        </div>
      </section>
    </>,
    document.body,
  )
}
