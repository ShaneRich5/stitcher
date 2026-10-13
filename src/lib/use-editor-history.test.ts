// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEditorHistory } from './use-editor-history'

let now = 0
vi.spyOn(performance, 'now').mockImplementation(() => now)

afterEach(() => {
  now = 0
})

function setup(initial = 0) {
  return renderHook(() => useEditorHistory<number>(initial))
}

describe('useEditorHistory', () => {
  it('undoes and redoes each commit', () => {
    const { result } = setup()
    act(() => result.current.commit(() => 1))
    act(() => result.current.commit(() => 2))
    expect(result.current.present).toBe(2)

    act(() => result.current.undo())
    expect(result.current.present).toBe(1)
    expect(result.current.canRedo).toBe(true)
    act(() => result.current.redo())
    expect(result.current.present).toBe(2)
    expect(result.current.canRedo).toBe(false)
  })

  it('ignores a commit that changes nothing', () => {
    const { result } = setup(5)
    act(() => result.current.commit((n) => n))
    expect(result.current.canUndo).toBe(false)
  })

  it('merges commits with the same key inside a second into one step', () => {
    const { result } = setup()
    for (let i = 1; i <= 5; i++) {
      now = i * 100
      act(() => result.current.commit(() => i, { coalesce: 'zoom' }))
    }
    expect(result.current.present).toBe(5)
    act(() => result.current.undo())
    expect(result.current.present).toBe(0)
    expect(result.current.canUndo).toBe(false)
  })

  it('measures the window from the last commit, so a steady drag stays one step', () => {
    const { result } = setup()
    for (let i = 1; i <= 5; i++) {
      now = i * 900
      act(() => result.current.commit(() => i, { coalesce: 'drag' }))
    }
    act(() => result.current.undo())
    expect(result.current.present).toBe(0)
  })

  it('starts a new step after a pause, or for a different key', () => {
    const { result } = setup()
    now = 0
    act(() => result.current.commit(() => 1, { coalesce: 'zoom' }))
    now = 1500
    act(() => result.current.commit(() => 2, { coalesce: 'zoom' }))
    now = 1600
    act(() => result.current.commit(() => 3, { coalesce: 'rotate' }))

    act(() => result.current.undo())
    expect(result.current.present).toBe(2)
    act(() => result.current.undo())
    expect(result.current.present).toBe(1)
  })

  it('does not merge into a step that was undone', () => {
    const { result } = setup()
    act(() => result.current.commit(() => 1, { coalesce: 'zoom' }))
    act(() => result.current.undo())
    act(() => result.current.commit(() => 2, { coalesce: 'zoom' }))
    act(() => result.current.undo())
    expect(result.current.present).toBe(0)
  })

  it('keeps at most 80 steps', () => {
    const { result } = setup()
    for (let i = 1; i <= 100; i++) act(() => result.current.commit(() => i))
    for (let i = 0; i < 100; i++) act(() => result.current.undo())
    expect(result.current.present).toBe(20)
    expect(result.current.canUndo).toBe(false)
  })

  it('clears redo on a new commit', () => {
    const { result } = setup()
    act(() => result.current.commit(() => 1))
    act(() => result.current.commit(() => 2))
    act(() => result.current.undo())
    act(() => result.current.commit(() => 3))
    expect(result.current.canRedo).toBe(false)
    act(() => result.current.redo())
    expect(result.current.present).toBe(3)
  })

  it('reset replaces the value without an undo step', () => {
    const { result } = setup()
    act(() => result.current.commit(() => 1))
    act(() => result.current.reset(42))
    expect(result.current.present).toBe(42)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})
