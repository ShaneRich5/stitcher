import { useState } from 'react'
import type { EditorMode } from '../components/mode-switch'

/** The mode a tool was last left in, remembered per browser; Quick until Studio is picked. */
export function useStoredMode(key: string): [EditorMode, (mode: EditorMode) => void] {
  const [mode, setMode] = useState<EditorMode>(() => {
    try {
      return localStorage.getItem(key) === 'studio' ? 'studio' : 'quick'
    } catch {
      return 'quick'
    }
  })
  const pick = (next: EditorMode) => {
    setMode(next)
    try {
      localStorage.setItem(key, next)
    } catch {
      // A browser that blocks storage just won't remember the choice.
    }
  }
  return [mode, pick]
}
