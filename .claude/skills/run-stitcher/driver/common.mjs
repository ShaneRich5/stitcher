import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

/** Everything lives next to the scripts: photos, screenshots, and the browser profile. */
export const DIR = dirname(fileURLToPath(import.meta.url))
export const PHOTOS = `${DIR}/photos`
export const SHOTS = `${DIR}/shots`
/** `vite preview` of the production build; set STITCHER_URL for the dev server (http://localhost:5173/). */
export const BASE = process.env.STITCHER_URL ?? 'http://localhost:4173/stitcher/'
mkdirSync(SHOTS, { recursive: true })

/** Sample photos from the Transformers.js docs dataset. */
const SAMPLES = {
  // Two footballers touching, 800 × 533: faces, and two subjects to choose between.
  'football-match.jpg': 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/football-match.jpg',
  // One man on a car, 970 × 1455: a clean single subject for the collage.
  'man-on-car.jpg':
    'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/young-man-standing-and-leaning-on-car.jpg',
}

/** The path of a sample photo, downloaded on first use. */
export async function photo(name) {
  const file = `${PHOTOS}/${name}`
  if (!existsSync(file)) {
    mkdirSync(PHOTOS, { recursive: true })
    const res = await fetch(SAMPLES[name])
    if (!res.ok) throw new Error(`Could not download ${name}: ${res.status}`)
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  }
  return file
}

/**
 * Open the app at `path` (relative to BASE) in headless Chrome, with the autosave cleared. The
 * profile persists, so the models download once. Errors are collected, minus known noise.
 */
export async function open(path = '') {
  const ctx = await chromium.launchPersistentContext(`${DIR}/profile`, {
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
    headless: true,
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
  })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  const errors = []
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    // MediaPipe logs INFO through console.error; Transformers.js probes for an optional RMBG file.
    if (t.startsWith('INFO:') || t.includes('status of 404')) return
    errors.push(t.slice(0, 300))
  })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
  await page.goto(BASE)
  await page.evaluate(async () => {
    for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name)
  })
  await page.goto(BASE + path)
  return { ctx, page, errors }
}

export async function shot(page, name, opts = {}) {
  const file = `${SHOTS}/${name}.png`
  await page.screenshot({ path: file, ...opts })
  console.log('shot', file)
}

/** Set a React-controlled range input (Playwright's `fill` doesn't do ranges). */
export async function setRange(page, selector, value) {
  await page.evaluate(
    ([sel, v]) => {
      const el = document.querySelector(sel)
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    [selector, value],
  )
}

/**
 * Carousel world pixels → page coordinates, for clicking on the Konva stage. The stage shows the
 * row of slides plus a pad of max(96, 8%) on every side. Defaults are the new-project 3 × 4:5.
 */
export async function worldToPage(page, wx, wy, { slideW = 1080, slideH = 1350, count = 3 } = {}) {
  const box = await page.locator('.stage-canvas canvas').first().boundingBox()
  const padX = Math.max(96, Math.round(slideW * 0.08))
  const padY = Math.max(96, Math.round(slideH * 0.08))
  return {
    x: box.x + ((wx + padX) * box.width) / (slideW * count + padX * 2),
    y: box.y + ((wy + padY) * box.height) / (slideH + padY * 2),
  }
}

/** Where football-match.jpg's pixels land when it's split across the default 3 slides (Fill). */
export const footballToWorld = (x, y) => ({ x: x * 4.05, y: y * 4.05 - 404.3 })

/** Run `steps`, screenshot on failure, report errors, close the browser, and set the exit code. */
export async function run(path, steps) {
  const { ctx, page, errors } = await open(path)
  let failed = false
  try {
    await steps(page)
  } catch (e) {
    failed = true
    console.log('FAILED', e.message)
    await shot(page, 'fail')
  } finally {
    console.log('errors:', errors.length ? errors : 'none')
    await ctx.close()
  }
  if (failed || errors.length) process.exitCode = 1
}
