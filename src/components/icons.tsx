import type { ReactNode } from 'react'

export type IconName =
  | 'undo'
  | 'redo'
  | 'eye'
  | 'download'
  | 'share'
  | 'rotate'
  | 'flip'
  | 'trash'
  | 'image'
  | 'plus'
  | 'minus'
  | 'scissors'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'forward'
  | 'backward'
  | 'lock'
  | 'unlock'
  | 'replace'
  | 'play'
  | 'pause'
  | 'film'
  | 'copy'
  | 'cutout'
  | 'layers'
  | 'sparkle'
  | 'alert'
  | 'aperture'

const PATHS: Record<IconName, ReactNode> = {
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </>
  ),
  rotate: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  flip: (
    <>
      <path d="M12 3v18" />
      <path d="M8 7 3 12l5 5V7Z" />
      <path d="M16 7l5 5-5 5V7Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  replace: (
    <>
      <path d="M4 7h11a4 4 0 0 1 4 4v1" />
      <path d="m8 3-4 4 4 4" />
      <path d="M20 17H9a4 4 0 0 1-4-4v-1" />
      <path d="m16 21 4-4-4-4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  scissors: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.1 15.9" />
      <path d="M14.5 14.5 20 20" />
      <path d="M8.1 8.1 12 12" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  forward: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    </>
  ),
  backward: (
    <>
      <rect x="4" y="4" width="12" height="12" rx="2" />
      <path d="M20 8v10a2 2 0 0 1-2 2H8" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-2" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5-12-7.5Z" />,
  pause: (
    <>
      <path d="M9 4v16" />
      <path d="M15 4v16" />
    </>
  ),
  film: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M7 5v14M17 5v14" />
      <path d="M2.5 12h19" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  cutout: (
    <>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M7.5 17a4.5 4.5 0 0 1 9 0" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12.5 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" />
      <path d="M19 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5Z" />
    </>
  ),
  aperture: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m14.2 8.2 5.2 9" />
      <path d="M10 8.2h10.4" />
      <path d="m7.8 12 5.2-9" />
      <path d="M9.8 15.8 4.6 6.8" />
      <path d="M14 15.8H3.6" />
      <path d="m16.2 12-5.2 9" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4" />
      <path d="M12 17h.01" />
    </>
  ),
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
