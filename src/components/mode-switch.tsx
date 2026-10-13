import { Icon } from './icons'

/** Quick is a few big controls around one photo; Studio is the full editor with panels. */
export type EditorMode = 'quick' | 'studio'

const MODES: { mode: EditorMode; label: string; hint: string; icon: 'bolt' | 'sliders' }[] = [
  { mode: 'quick', label: 'Quick', hint: 'A few big controls', icon: 'bolt' },
  { mode: 'studio', label: 'Studio', hint: 'Layers, an inspector and every setting', icon: 'sliders' },
]

export function ModeSwitch({ mode, onMode }: { mode: EditorMode; onMode: (mode: EditorMode) => void }) {
  return (
    <div className="mode-switch" role="group" aria-label="Editing mode">
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          title={m.hint}
          aria-pressed={mode === m.mode}
          className={mode === m.mode ? 'on' : ''}
          onClick={() => onMode(m.mode)}
        >
          <Icon name={m.icon} size={15} />
          {m.label}
        </button>
      ))}
    </div>
  )
}
