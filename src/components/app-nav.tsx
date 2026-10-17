import type { MouseEvent, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { currentIssueContext, issueUrl } from '../lib/report-issue'
import { Icon } from './icons'

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
      <div className="app-nav-actions">
        {actions}
        <ReportIssueLink variant="icon" />
      </div>
    </nav>
  )
}

/**
 * Opens a new GitHub issue in a new tab, with where it came from, the build, the browser and the
 * screen filled in. Built when it's rendered and again when it's clicked, so it says how things
 * are at that moment.
 */
export function ReportIssueLink({ variant }: { variant: 'icon' | 'text' }) {
  const label = 'Report an issue'
  const href = () => issueUrl(currentIssueContext(window.location.pathname))
  const common = {
    href: href(),
    target: '_blank',
    rel: 'noopener noreferrer',
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      e.currentTarget.href = href()
    },
  }
  return variant === 'icon' ? (
    <a {...common} className="icon-btn app-nav-report" aria-label={`${label} on GitHub`} title={`${label} on GitHub`}>
      <Icon name="flag" size={16} />
    </a>
  ) : (
    <a {...common}>{label}</a>
  )
}
