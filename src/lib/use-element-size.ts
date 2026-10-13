import { useEffect, useState } from 'react'

/**
 * The content box of whichever element the returned ref is attached to, kept current as it
 * resizes. A callback ref, so an element that mounts later (switching to Studio) is measured too.
 * Zero until measured.
 */
export function useElementSize(): [(el: HTMLElement | null) => void, { width: number; height: number }] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!el) return
    // ResizeObserver reports the initial size as soon as it starts observing.
    const observer = new ResizeObserver(([entry]) => {
      const box = entry!.contentRect
      setSize((s) => (s.width === box.width && s.height === box.height ? s : { width: box.width, height: box.height }))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return [setEl, size]
}
