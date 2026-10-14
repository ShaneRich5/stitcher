/**
 * Every deploy replaces the built files with new hashed names, so a tab opened before a deploy
 * asks for files that are gone the first time it loads something lazily: the cutout models, the
 * video encoder, a tool's page. This notices, when such a load fails or when the tab comes back
 * and the live page names a newer build, so the app can offer a reload instead of failing quietly.
 */

/** What browsers say when a lazily loaded file can't be fetched (Chrome, Firefox, Safari, CSS). */
const STALE_LOAD = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
]

export const STALE_MESSAGE = 'Stitcher was updated since this page opened. Reload to use this.'

/** Look for a newer build at most this often, when the tab comes back. */
const CHECK_EVERY_MS = 5 * 60_000

let stale = false
let lastCheck = Date.now()
const listeners = new Set<() => void>()

function markStale() {
  if (stale) return
  stale = true
  for (const listener of listeners) listener()
}

export function isStale(): boolean {
  return stale
}

export function subscribeStale(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** True when an error means this page's build has been replaced. */
export function isStaleLoad(e: unknown): boolean {
  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  return STALE_LOAD.some((re) => re.test(message))
}

/** The toast for a failure: a reload hint when an old build is the cause, else `fallback`. */
export function failureMessage(e: unknown, fallback: string): string {
  if (!isStaleLoad(e)) return fallback
  markStale()
  return STALE_MESSAGE
}

/** The entry script a page's HTML loads, e.g. /stitcher/assets/index-B5uVGA1I.js; null in dev. */
export function entryScript(html: string): string | null {
  return html.match(/<script[^>]*type="module"[^>]*src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1] ?? null
}

async function checkForUpdate() {
  if (stale || Date.now() - lastCheck < CHECK_EVERY_MS) return
  lastCheck = Date.now()
  const current = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  if (!current) return
  try {
    const res = await fetch(import.meta.env.BASE_URL, { cache: 'no-store' })
    const live = res.ok ? entryScript(await res.text()) : null
    if (live && new URL(live, location.href).href !== current.src) markStale()
  } catch {
    // Offline or blocked: look again next time.
  }
}

/** Start watching; returns a function that stops. */
export function watchForUpdates(): () => void {
  // Vite's lazy-import wrapper reports failed loads here. Not cancelled, so callers still see them.
  const onPreloadError = () => markStale()
  const onRejection = (e: PromiseRejectionEvent) => {
    if (isStaleLoad(e.reason)) markStale()
  }
  const onBack = () => {
    if (document.visibilityState === 'visible') void checkForUpdate()
  }
  window.addEventListener('vite:preloadError', onPreloadError)
  window.addEventListener('unhandledrejection', onRejection)
  document.addEventListener('visibilitychange', onBack)
  window.addEventListener('focus', onBack)
  return () => {
    window.removeEventListener('vite:preloadError', onPreloadError)
    window.removeEventListener('unhandledrejection', onRejection)
    document.removeEventListener('visibilitychange', onBack)
    window.removeEventListener('focus', onBack)
  }
}
