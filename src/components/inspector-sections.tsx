import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from './icons'

export type InspectorSection = {
  id: string
  label: string
  body: ReactNode
  /** A count of things to look at, shown on the section's heading. */
  badge?: number
}

type Props = {
  /** `panel` is Studio's right column on desktop, with sections; `sheet` is the phone's tabbed sheet. */
  variant: 'panel' | 'sheet'
  label: string
  head: ReactNode
  sections: InspectorSection[]
  /** Where the panel remembers which sections are open. */
  storageKey: string
  defaultOpen: string[]
}

/** Which sections are open is a convenience, so a browser that blocks storage gets the defaults. */
function readOpen(key: string, fallback: string[]): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown
    return Array.isArray(stored) ? stored.filter((s): s is string => typeof s === 'string') : fallback
  } catch {
    return fallback
  }
}

/**
 * Studio's inspector for the GIF and collage tools: the same head, collapsible sections and phone
 * tabs as the carousel's, filled with each tool's own fields.
 */
export function InspectorSections({ variant, label, head, sections, storageKey, defaultOpen }: Props) {
  const [open, setOpen] = useState<string[]>(() => readOpen(storageKey, defaultOpen))
  const [tab, setTab] = useState(sections[0]?.id ?? '')
  const current = sections.find((s) => s.id === tab) ?? sections[0]

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(open))
    } catch {
      // A browser that blocks storage just won't remember the choice.
    }
  }, [open, storageKey])

  const badge = (s: InspectorSection) => (s.badge ? <span className="inspector-badge">{s.badge}</span> : null)

  return (
    <div className={`inspector is-${variant}`} role="region" aria-label={label}>
      <div className="inspector-head">{head}</div>
      {variant === 'panel' ? (
        sections.map((s) => {
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
                {badge(s)}
                <Icon name="chevron-down" size={16} />
              </button>
              {isOpen ? s.body : null}
            </section>
          )
        })
      ) : (
        <>
          <div className="inspector-tabs" role="tablist" aria-label={label}>
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                id={`inspector-tab-${s.id}`}
                aria-selected={current?.id === s.id}
                aria-controls="inspector-tabpanel"
                className={current?.id === s.id ? 'on' : ''}
                onClick={() => setTab(s.id)}
              >
                {s.label}
                {badge(s)}
              </button>
            ))}
          </div>
          <div id="inspector-tabpanel" role="tabpanel" aria-labelledby={`inspector-tab-${current?.id}`}>
            {current?.body}
          </div>
        </>
      )}
    </div>
  )
}

/** A planned inspector section, so people can see what's coming. */
export function SoonNote({ children }: { children: ReactNode }) {
  return (
    <div className="inspector-fields">
      <p className="soon-note">
        <span className="soon-pill">Soon</span>
        <span>{children}</span>
      </p>
    </div>
  )
}
