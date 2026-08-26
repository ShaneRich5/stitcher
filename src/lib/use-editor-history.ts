import { useCallback, useRef, useState } from 'react'
import type { Layer, ProjectTile } from '../types'

export type EditorSnapshot = {
  tiles: ProjectTile[]
  layers: Layer[]
  activeTileId: string
  selectedId: string | null
}

function cloneSnapshot(s: EditorSnapshot): EditorSnapshot {
  return {
    tiles: s.tiles.map((t) => ({ ...t })),
    layers: s.layers.map((l) => ({ ...l })),
    activeTileId: s.activeTileId,
    selectedId: s.selectedId,
  }
}

const MAX_STACK = 60

export function useEditorHistory() {
  const past = useRef<EditorSnapshot[]>([])
  const future = useRef<EditorSnapshot[]>([])
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false })

  const sync = useCallback(() => {
    setFlags({
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,
    })
  }, [])

  const push = useCallback(
    (current: EditorSnapshot) => {
      past.current.push(cloneSnapshot(current))
      if (past.current.length > MAX_STACK) past.current.shift()
      future.current = []
      sync()
    },
    [sync],
  )

  const undo = useCallback(
    (current: EditorSnapshot): EditorSnapshot | null => {
      const prev = past.current.pop()
      if (!prev) return null
      future.current.push(cloneSnapshot(current))
      sync()
      return prev
    },
    [sync],
  )

  const redo = useCallback(
    (current: EditorSnapshot): EditorSnapshot | null => {
      const next = future.current.pop()
      if (!next) return null
      past.current.push(cloneSnapshot(current))
      sync()
      return next
    },
    [sync],
  )

  return { push, undo, redo, canUndo: flags.canUndo, canRedo: flags.canRedo }
}
