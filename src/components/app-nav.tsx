import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

const links = [
  { to: '/carousel', label: 'Carousel' },
  { to: '/gif', label: 'GIF' },
  { to: '/collage', label: 'Collage' },
] as const

type Props = {
  /** Undo, export and the like, at the end of the bar. */
  actions?: ReactNode
  /** Next to the tool links, e.g. the save status. */
  status?: ReactNode
  /** In the middle of the bar, e.g. the Quick / Studio switch. */
  center?: ReactNode
}

export function AppNav({ actions, status, center }: Props) {
  return (
    <nav className="app-nav" aria-label="Tools">
      <Link to="/" className="app-nav-brand">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <rect x="1" y="5" width="8" height="16" rx="2" fill="var(--brand-1)" />
          <rect x="9" y="5" width="8" height="16" fill="var(--brand-2)" />
          <rect x="17" y="5" width="8" height="16" rx="2" fill="var(--brand-3)" />
        </svg>
        <span>Stitcher</span>
      </Link>
      <ul className="app-nav-links">
        {links.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              inactiveProps={{ className: 'app-nav-link' }}
              activeProps={{ className: 'app-nav-link active' }}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
      {status ? <div className="app-nav-status">{status}</div> : null}
      {center ? <div className="app-nav-center">{center}</div> : null}
      {actions ? <div className="app-nav-actions">{actions}</div> : null}
    </nav>
  )
}
