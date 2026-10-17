import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { AppNav, ReportIssueLink } from './app-nav'
import { PanoramaScene } from './panorama-scene'

const SLIDES = [0, 1, 2, 3]

function CarouselArt() {
  return (
    <svg viewBox="0 0 200 100" width="200" height="100" aria-hidden="true">
      <rect x="28" y="20" width="152" height="60" fill="#e3dafb" />
      <circle cx="130" cy="42" r="12" fill="#f4b886" />
      <path d="M28 66 L58 50 L84 60 L112 42 L144 58 L180 46 L180 80 L28 80 Z" fill="#8f6df0" />
      <path d="M28 74 C70 66 120 80 180 70 L180 80 L28 80 Z" fill="#2d2166" />
      <rect x="76" y="16" width="4" height="68" className="landing-seam" />
      <rect x="128" y="16" width="4" height="68" className="landing-seam" />
    </svg>
  )
}

function GifArt() {
  const frames = [
    { x: 20, ballY: 48 },
    { x: 62, ballY: 32 },
    { x: 104, ballY: 27 },
    { x: 146, ballY: 40 },
  ]
  return (
    <svg viewBox="0 0 200 100" width="200" height="100" aria-hidden="true">
      {frames.map((f) => (
        <g key={f.x}>
          <rect x={f.x} y="16" width="34" height="42" rx="4" fill="#e3dafb" />
          <circle cx={f.x + 17} cy={f.ballY} r="6" fill="#5b36d6" />
        </g>
      ))}
      <path
        d="M20 76 H180 M20 71 V81 M62 71 V81 M104 71 V81 M146 71 V81 M180 71 V81"
        className="landing-ruler"
      />
      <path d="M114 66 V86" stroke="#5b36d6" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function CollageArt() {
  return (
    <svg viewBox="0 0 200 100" width="200" height="100" aria-hidden="true">
      <rect x="58" y="16" width="62" height="72" rx="6" fill="#c7b6f6" transform="rotate(-8 89 52)" />
      <rect x="80" y="12" width="62" height="72" rx="6" fill="#9a7cec" transform="rotate(5 111 48)" />
      <circle cx="111" cy="40" r="11" fill="#2d2166" />
      <path d="M90 80 C90 60 132 60 132 80 Z" fill="#2d2166" />
    </svg>
  )
}

const tools: { to: '/carousel' | '/gif' | '/collage'; name: string; blurb: string; art: ReactNode }[] = [
  {
    to: '/carousel',
    name: 'Carousel',
    blurb: 'Spread one photo, or many, across a row of slides and export each slide as its own image.',
    art: <CarouselArt />,
  },
  {
    to: '/gif',
    name: 'GIF',
    blurb: 'Turn a run of photos into a GIF or an MP4, with timing you can set frame by frame.',
    art: <GifArt />,
  },
  {
    to: '/collage',
    name: 'Collage',
    blurb: 'Cut the subject out of each photo and stack them into a short video, with a little parallax.',
    art: <CollageArt />,
  },
]

const promises = ['No account', 'No upload', 'No watermark', 'No paywall']

function ArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LandingPage() {
  return (
    <>
      <AppNav />
      <main className="landing">
        <section className="landing-hero">
          <p className="landing-chip">
            <span aria-hidden="true" />
            Free, and it runs in your browser
          </p>
          <h1>One photo, stitched across every slide.</h1>
          <p className="landing-lede">
            Lay your photos across a row of slides and export each one, ready to post. The swipe never
            breaks at the seam.
          </p>
          <div className="landing-ctas">
            <Link to="/carousel" className="landing-btn primary">
              Make a carousel
              <ArrowIcon />
            </Link>
            <a href="#tools" className="landing-btn">
              See all three tools
            </a>
          </div>
        </section>

        <section className="landing-pano-wrap">
          <div
            className="landing-pano"
            role="img"
            aria-label="One panorama split across four slides, with the sun crossing a seam"
          >
            {SLIDES.map((i) => (
              <div key={i} className="landing-slide">
                <svg viewBox={`${i * 240} 0 240 300`} aria-hidden="true">
                  <PanoramaScene />
                </svg>
              </div>
            ))}
          </div>
          <div className="landing-dots" aria-hidden="true">
            {SLIDES.map((i) => (
              <span key={i} className={i === 0 ? 'active' : undefined} />
            ))}
          </div>
        </section>

        <section id="tools" className="landing-tools">
          <div className="landing-tools-head">
            <h2>Three tools, one tab.</h2>
            <p>Drop in your photos and go. There's nothing to install.</p>
          </div>
          <div className="landing-cards">
            {tools.map((tool) => (
              <Link key={tool.to} to={tool.to} className="landing-card">
                <div className="landing-card-art">{tool.art}</div>
                <div className="landing-card-text">
                  <h3>{tool.name}</h3>
                  <p>{tool.blurb}</p>
                </div>
                <span className="landing-card-cta">
                  Open {tool.name}
                  <ArrowIcon size={14} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="landing-promise">
          <p>Everything happens on your device.</p>
          <ul>
            {promises.map((item) => (
              <li key={item}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3 8.5l3 3 7-7"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-footer-brand">
          <svg width="18" height="18" viewBox="0 0 26 26" aria-hidden="true">
            <rect x="1" y="5" width="8" height="16" rx="2" fill="var(--brand-1)" />
            <rect x="9" y="5" width="8" height="16" fill="var(--brand-2)" />
            <rect x="17" y="5" width="8" height="16" rx="2" fill="var(--brand-3)" />
          </svg>
          Stitcher
        </span>
        <span>A free image studio for the posts people swipe through.</span>
        <span className="landing-footer-report">
          Something not working? <ReportIssueLink variant="text" />
        </span>
      </footer>
    </>
  )
}
