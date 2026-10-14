import { useState, useSyncExternalStore } from 'react'
import { isStale, subscribeStale } from '../lib/app-update'
import { Icon } from './icons'

/** Offers a reload once this page's build has been replaced by a newer deploy. */
export function UpdateBanner() {
  const stale = useSyncExternalStore(subscribeStale, isStale)
  const [dismissed, setDismissed] = useState(false)
  if (!stale || dismissed) return null
  return (
    <div className="update-banner" role="status">
      <Icon name="restart" size={16} />
      <span>
        <strong>Stitcher was updated since this page opened.</strong> Reload to get the new version. Your carousel is
        saved on this device; export any GIF or collage first.
      </span>
      <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
        Reload
      </button>
      <button type="button" className="icon-btn" aria-label="Not now" title="Not now" onClick={() => setDismissed(true)}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
