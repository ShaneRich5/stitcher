import { useEffect, useState } from 'react'
import type { CarouselDoc } from '../types'
import { renderSlide } from './render-slide'

/** Small PNG data URLs of every slide, re-rendered shortly after the doc settles. */
export function useSlideThumbnails(doc: CarouselDoc, heightPx: number, delayMs = 150): string[] {
  const [thumbs, setThumbs] = useState<string[]>([])

  useEffect(() => {
    const id = window.setTimeout(() => {
      const scale = (heightPx * (window.devicePixelRatio || 1)) / doc.slideH
      setThumbs(
        Array.from({ length: doc.count }, (_, i) => renderSlide(doc, i, scale).toDataURL('image/png')),
      )
    }, delayMs)
    return () => window.clearTimeout(id)
  }, [doc, heightPx, delayMs])

  return thumbs
}
