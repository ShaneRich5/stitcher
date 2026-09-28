import { useCallback, useRef, useState } from 'react'

const MAX_STACK = 80
/** Commits with the same coalesce key inside this window share one undo step. */
const COALESCE_MS = 1000

export type CommitOptions = { coalesce?: string }

/**
 * Immutable undo/redo. Every change goes through `commit`, which records the previous value.
 * Rapid-fire edits (slider drags, arrow-key nudges, color picking) pass a `coalesce` key so
 * they collapse into a single step.
 */
export function useEditorHistory<T>(initial: T | (() => T)) {
  const [present, setPresent] = useState(initial)
  const presentRef = useRef(present)
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const last = useRef<{ key?: string; at: number }>({ at: 0 })
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false })

  const apply = useCallback((next: T) => {
    presentRef.current = next
    setPresent(next)
    setFlags({ canUndo: past.current.length > 0, canRedo: future.current.length > 0 })
  }, [])

  const commit = useCallback(
    (update: (prev: T) => T, options?: CommitOptions) => {
      const prev = presentRef.current
      const next = update(prev)
      if (Object.is(next, prev)) return
      const now = performance.now()
      const key = options?.coalesce
      const merge = key !== undefined && last.current.key === key && now - last.current.at < COALESCE_MS
      if (!merge) {
        past.current.push(prev)
        if (past.current.length > MAX_STACK) past.current.shift()
      }
      future.current = []
      last.current = { key, at: now }
      apply(next)
    },
    [apply],
  )

  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (prev === undefined) return
    future.current.push(presentRef.current)
    last.current = { at: 0 }
    apply(prev)
  }, [apply])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (next === undefined) return
    past.current.push(presentRef.current)
    last.current = { at: 0 }
    apply(next)
  }, [apply])

  return { present, commit, undo, redo, canUndo: flags.canUndo, canRedo: flags.canRedo }
}
