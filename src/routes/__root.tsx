import { Outlet, createRootRoute } from '@tanstack/react-router'
import { AppNav } from '../components/app-nav'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="app-shell">
      <AppNav />
      <div className="app-shell-body">
        <Outlet />
      </div>
    </div>
  )
}
