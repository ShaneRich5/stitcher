import { Link } from '@tanstack/react-router'

const links = [
  { to: '/', label: 'Carousel' },
  { to: '/gif', label: 'GIF' },
] as const

export function AppNav() {
  return (
    <nav className="app-nav" aria-label="Tools">
      <Link to="/" className="app-nav-brand">
        Stitcher
      </Link>
      <ul className="app-nav-links">
        {links.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              activeOptions={{ exact: link.to === '/' }}
              inactiveProps={{ className: 'app-nav-link' }}
              activeProps={{ className: 'app-nav-link active' }}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
