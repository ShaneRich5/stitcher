import { useEffect } from 'react'
import { Outlet } from '@tanstack/react-router'
import { watchForUpdates } from '../lib/app-update'
import { UpdateBanner } from './update-banner'

// Each tool renders its own <AppNav> so it can put its actions (undo, export…) in the bar.
export function RootLayout() {
  useEffect(() => watchForUpdates(), [])
  return (
    <div className="app-shell">
      <Outlet />
      <UpdateBanner />
    </div>
  )
}
