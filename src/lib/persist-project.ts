import { idbDelete, idbGet, idbKeys, idbSet, IMAGE_STORE, PROJECT_STORE } from './idb'
import { getImage, registerBlob } from './image-registry'
import type { CarouselDoc } from '../types'

const PROJECT_KEY = 'current'
const SAVE_DEBOUNCE_MS = 800

let saveTimer: number | undefined
let pendingDoc: CarouselDoc | null = null
/** Image ids already written to IMAGE_STORE, so unchanged images aren't rewritten every save. */
const knownStoredIds = new Set<string>()

async function persistImages(doc: CarouselDoc): Promise<void> {
  const wanted = new Set(doc.layers.map((l) => l.imageId))

  await Promise.all(
    Array.from(wanted).map(async (id) => {
      if (knownStoredIds.has(id)) return
      const record = getImage(id)
      if (!record) return // not decoded yet; it'll be picked up on the next save
      await idbSet(IMAGE_STORE, id, record.blob)
      knownStoredIds.add(id)
    }),
  )

  // Undo history isn't persisted, so any image the current doc no longer uses can go.
  const stored = await idbKeys(IMAGE_STORE)
  await Promise.all(
    stored
      .filter((key): key is string => typeof key === 'string' && !wanted.has(key))
      .map(async (id) => {
        await idbDelete(IMAGE_STORE, id)
        knownStoredIds.delete(id)
      }),
  )
}

async function persistNow(doc: CarouselDoc): Promise<void> {
  await idbSet(PROJECT_STORE, PROJECT_KEY, doc)
  await persistImages(doc)
}

/** Call on every doc change; writes settle a moment after edits stop. */
export function scheduleSave(doc: CarouselDoc): void {
  pendingDoc = doc
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    const next = pendingDoc
    pendingDoc = null
    if (next) void persistNow(next)
  }, SAVE_DEBOUNCE_MS)
}

/** Save immediately instead of waiting for the debounce, e.g. before the page unloads. */
export function flushSave(): void {
  window.clearTimeout(saveTimer)
  const next = pendingDoc
  pendingDoc = null
  if (next) void persistNow(next)
}

/**
 * Load the last autosaved project and decode its images back into the registry. Returns null if
 * nothing was saved, or if any part of it fails to restore — in which case a fresh doc is used
 * instead of showing a partly-broken one.
 */
export async function loadProject(): Promise<CarouselDoc | null> {
  try {
    const doc = await idbGet<CarouselDoc>(PROJECT_STORE, PROJECT_KEY)
    if (!doc) return null
    const ids = Array.from(new Set(doc.layers.map((l) => l.imageId)))
    await Promise.all(
      ids.map(async (id) => {
        const blob = await idbGet<Blob>(IMAGE_STORE, id)
        if (!blob) throw new Error(`Saved image ${id} is missing`)
        await registerBlob(id, blob)
        knownStoredIds.add(id)
      }),
    )
    return doc
  } catch {
    return null
  }
}
