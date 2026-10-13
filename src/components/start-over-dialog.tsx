import { useEffect, useEffectEvent, useRef } from 'react'
import { Icon } from './icons'

type Props = {
  onConfirm: () => void
  onCancel: () => void
}

/** Asks before clearing the carousel, since the only copy of the work is in this browser. */
export function StartOverDialog({ onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus the safe choice, so a stray Enter keeps the work.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="start-over-title"
        aria-describedby="start-over-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="dialog-icon">
          <Icon name="alert" size={22} />
        </span>
        <h2 id="start-over-title">Start over?</h2>
        <p id="start-over-desc">
          This removes every photo from your carousel and resets the slides. Stitcher only keeps your work in this
          browser, so it can't be brought back. Export first if you want to keep it.
        </p>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="btn btn-outline" onClick={onCancel}>
            Keep editing
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            Start over
          </button>
        </div>
      </div>
    </div>
  )
}
