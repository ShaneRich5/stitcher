import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { IMAGE_ACCEPT, listFiles } from '../lib/load-image'
import {
  COLLAGE_SAMPLE_PHOTOS,
  collageSampleLayout,
  FRIEND_ART,
  GIF_SAMPLE_PANS,
  gifSampleLayout,
  SUNSET_ART,
  type Rect,
} from '../lib/samples'
import { ReportIssueLink } from './app-nav'
import { Icon } from './icons'

type Props = {
  title: string
  lede: string
  /** What the main button adds, e.g. "Choose photos". */
  chooseLabel: string
  onFiles: (files: File[]) => void
  /** Load the example again, with its quick guide. */
  onExample: () => void
  preview: ReactNode
  /** The other tools, for the line at the bottom. */
  others: { to: '/carousel' | '/gif' | '/collage'; label: string }[]
}

/**
 * An empty GIF or Collage tool: one way in, a way back to the example and its guide, and a
 * picture of what the tool makes, in the carousel welcome's style.
 */
export function ToolWelcome({ title, lede, chooseLabel, onFiles, onExample, preview, others }: Props) {
  return (
    <div className="welcome tool-welcome">
      <p className="welcome-chip">
        <span aria-hidden="true" />
        Free, and your photos never leave your device
      </p>
      <h1>{title}</h1>
      <p className="welcome-lede">{lede}</p>
      <div className="tool-welcome-actions">
        <label className="btn btn-primary welcome-choose">
          <Icon name="image" />
          {chooseLabel}
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            className="visually-hidden"
            onChange={(e) => {
              const files = listFiles(e.target.files)
              if (files.length) onFiles(files)
              e.target.value = ''
            }}
          />
        </label>
        <button type="button" className="btn btn-outline welcome-example" onClick={onExample}>
          <Icon name="play" size={16} />
          Show me an example
        </button>
      </div>
      <p className="welcome-hint">or drop them anywhere on the page, or paste them</p>

      <div className="tool-welcome-preview" aria-hidden="true">
        {preview}
      </div>

      <p className="tool-welcome-others">
        Making something else? Try the{' '}
        {others.map((o, i) => (
          <span key={o.to}>
            {i > 0 ? ' or ' : null}
            <Link to={o.to}>{o.label}</Link>
          </span>
        ))}{' '}
        tool. Something not working? <ReportIssueLink variant="text" />.
      </p>
    </div>
  )
}

/** Part of the sample art in a box: the sunset, and the friend over it if they're in view. */
function ArtCrop({
  width,
  height,
  sunset,
  friend,
  flip = false,
  tone,
  className,
}: {
  width: number
  height: number
  sunset?: Rect
  friend?: Rect
  flip?: boolean
  tone?: string
  className?: string
}) {
  const place = (r: Rect) => ({ left: r.x, top: r.y, width: r.width, height: r.height })
  return (
    <span className={`art-crop ${className ?? ''}`} style={{ width, height }}>
      {sunset ? <img src={SUNSET_ART} alt="" style={{ ...place(sunset), filter: tone }} /> : null}
      {friend ? (
        <img src={FRIEND_ART} alt="" style={{ ...place(friend), transform: flip ? 'scaleX(-1)' : undefined }} />
      ) : null}
    </span>
  )
}

function useReducedMotion(): boolean {
  const [reduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  return reduced
}

const FRAME_H = 190

/** The GIF sample's frames in a row, the one "playing" lifting out of it in turn. */
export function GifWelcomePreview() {
  const reduced = useReducedMotion()
  const [at, setAt] = useState(0)

  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => setAt((i) => (i + 1) % GIF_SAMPLE_PANS.length), 420)
    return () => window.clearInterval(id)
  }, [reduced])

  return (
    <div className="gif-welcome">
      {GIF_SAMPLE_PANS.map((_, i) => {
        const l = gifSampleLayout(i, FRAME_H)
        return (
          <ArtCrop
            key={i}
            className={`gif-welcome-frame ${i === at ? 'on' : ''}`}
            width={l.width}
            height={l.height}
            sunset={l.sunset}
            friend={l.friend}
          />
        )
      })}
    </div>
  )
}

const PHOTO_H = 150
const RESULT_H = 236

/** The Collage sample's photos, and the video they make: the first photo's friend stepping in over the last photo, as the loop closes. */
export function CollageWelcomePreview() {
  const last = COLLAGE_SAMPLE_PHOTOS.length - 1
  const photoW = Math.round((PHOTO_H * 9) / 16)
  const resultW = Math.round((RESULT_H * 9) / 16)
  const lastPhoto = collageSampleLayout(last, resultW, RESULT_H)
  return (
    <div className="collage-welcome">
      <div className="collage-welcome-photos">
        {COLLAGE_SAMPLE_PHOTOS.map((photo, i) => {
          const l = collageSampleLayout(i, photoW, PHOTO_H)
          return (
            <ArtCrop
              key={photo.name}
              className="collage-welcome-photo"
              width={photoW}
              height={PHOTO_H}
              sunset={l.sunset}
              friend={l.friend}
              flip={photo.flip}
              tone={photo.tone}
            />
          )
        })}
      </div>
      <Icon name="chevron-right" size={28} />
      <span className="collage-welcome-result" style={{ width: resultW, height: RESULT_H }}>
        <ArtCrop
          width={resultW}
          height={RESULT_H}
          sunset={lastPhoto.sunset}
          friend={lastPhoto.friend}
          flip={COLLAGE_SAMPLE_PHOTOS[last].flip}
          tone={COLLAGE_SAMPLE_PHOTOS[last].tone}
        />
        <ArtCrop
          className="collage-welcome-cutout"
          width={resultW}
          height={RESULT_H}
          friend={collageSampleLayout(0, resultW, RESULT_H).friend}
          flip={COLLAGE_SAMPLE_PHOTOS[0].flip}
        />
      </span>
    </div>
  )
}
