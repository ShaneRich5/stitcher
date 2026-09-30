/** Tiny promise wrapper around the two IndexedDB stores the carousel autosave uses. */

const DB_NAME = 'stitcher'
const DB_VERSION = 1
export const PROJECT_STORE = 'project'
export const IMAGE_STORE = 'images'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE)
      if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Could not open the local database'))
  })
  return dbPromise
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb()
  return request(db.transaction(store, 'readonly').objectStore(store).get(key))
}

export async function idbSet(store: string, key: IDBValidKey, value: unknown): Promise<void> {
  const db = await openDb()
  await request(db.transaction(store, 'readwrite').objectStore(store).put(value, key))
}

export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDb()
  await request(db.transaction(store, 'readwrite').objectStore(store).delete(key))
}

export async function idbKeys(store: string): Promise<IDBValidKey[]> {
  const db = await openDb()
  return request(db.transaction(store, 'readonly').objectStore(store).getAllKeys())
}
