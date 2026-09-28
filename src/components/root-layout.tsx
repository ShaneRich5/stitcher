import { Outlet } from '@tanstack/react-router'

// Each tool renders its own <AppNav> so it can put its actions (undo, export…) in the bar.
export function RootLayout() {
  return (
    <div className="app-shell">
      <Outlet />
    </div>
  )
}
