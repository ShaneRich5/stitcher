import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test as base, type Locator, type Page } from '@playwright/test'
import { toPage } from '../support/carousel'

// Demos are walkthroughs recorded to video, not checks: they move at a watchable pace, draw a
// cursor (Playwright's videos have none) and caption each step. `npm run demo` records them into
// demo-videos/, one .webm per demo, named after it.

export const VIDEO_DIR = 'demo-videos'

/** A pointer that follows the real mouse events, with a ring while the button is down. */
function installCursor() {
  const install = () => {
    if (document.getElementById('demo-cursor')) return
    const style = document.createElement('style')
    style.textContent = `
      #demo-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none;
        width: 26px; height: 26px; margin: -3px 0 0 -4px; transition: transform 40ms linear; }
      #demo-cursor::after { content: ''; position: absolute; left: -12px; top: -12px; width: 32px; height: 32px;
        border-radius: 50%; background: rgba(91, 54, 214, 0.28); transform: scale(0); transition: transform 120ms ease-out; }
      #demo-cursor.down::after { transform: scale(1); }
      #demo-caption { position: fixed; left: 50%; bottom: 28px; z-index: 2147483646; pointer-events: none;
        transform: translate(-50%, 12px); opacity: 0; max-width: 80vw; padding: 12px 22px; border-radius: 14px;
        background: rgba(29, 27, 24, 0.86); color: #fff; font: 600 20px/1.35 system-ui, sans-serif;
        text-align: center; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25); transition: opacity 250ms, transform 250ms; }
      #demo-caption.on { opacity: 1; transform: translate(-50%, 0); }`
    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    cursor.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6-3.6 6.9L4 2Z" ' +
      'fill="#1d1b18" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    document.head.append(style)
    document.body.append(cursor)
    const move = (e: MouseEvent) => (cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`)
    document.addEventListener('mousemove', move, true)
    document.addEventListener('mousedown', () => cursor.classList.add('down'), true)
    document.addEventListener('mouseup', () => cursor.classList.remove('down'), true)
  }
  if (document.body) install()
  else document.addEventListener('DOMContentLoaded', install)
}

/** `test` for demos: the page draws a cursor, and its video is saved as demo-videos/<title>.webm. */
export const test = base.extend({
  page: async ({ page }, provide, testInfo) => {
    await page.addInitScript(installCursor)
    mouse = { x: 700, y: 450 }
    await provide(page)
    const video = page.video()
    await page.close()
    if (video) {
      mkdirSync(VIDEO_DIR, { recursive: true })
      const name = testInfo.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      await video.saveAs(join(VIDEO_DIR, `${name}.webm`))
    }
  },
})

export { expect } from '@playwright/test'

/** Hold still so the viewer can take it in. */
export const pause = (page: Page, ms = 900) => page.waitForTimeout(ms)

/** Show a caption at the bottom, and leave time to read it. Null clears it. */
export async function say(page: Page, text: string | null, readMs = 1600) {
  await page.evaluate((t) => {
    let el = document.getElementById('demo-caption')
    if (!el) {
      el = document.createElement('div')
      el.id = 'demo-caption'
      document.body.append(el)
    }
    if (t) el.textContent = t
    el.classList.toggle('on', !!t)
  }, text)
  if (text) await pause(page, readMs)
}

let mouse = { x: 700, y: 450 }

/** Move the mouse to a page point at a hand's pace: longer moves take longer. */
export async function glide(page: Page, to: { x: number; y: number }) {
  const distance = Math.hypot(to.x - mouse.x, to.y - mouse.y)
  await page.mouse.move(to.x, to.y, { steps: Math.max(8, Math.round(distance / 12)) })
  mouse = to
}

/** Glide to an element and click it. */
export async function clickOn(page: Page, target: Locator) {
  const box = (await target.boundingBox())!
  await glide(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  await pause(page, 250)
  await target.click()
  await pause(page, 500)
}

/** Click an element that opens the file picker, and pick `files`, as a person choosing photos would. */
export async function choose(page: Page, opener: Locator, files: Parameters<Page['setInputFiles']>[1]) {
  const chooser = page.waitForEvent('filechooser')
  await clickOn(page, opener)
  await (await chooser).setFiles(files)
}

/**
 * Drag between two carousel world points. With `hold`, it rests near the end for that long first,
 * with the button still down, so the snap guide shows.
 */
export async function dragWorld(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, hold = 0) {
  const a = await toPage(page, from.x, from.y)
  const b = await toPage(page, to.x, to.y)
  await glide(page, a)
  await pause(page, 250)
  await page.mouse.down()
  await glide(page, b)
  if (hold) await pause(page, hold)
  await page.mouse.up()
  await pause(page, 500)
}

/**
 * Photos drawn in the page, so the demos need no image files: `panorama` is a wide sunset over
 * mountains and a lake, `balloon` a tall shot of a hot-air balloon.
 */
export async function scenery(page: Page, kind: 'panorama' | 'balloon') {
  const dataUrl = await page.evaluate((kind) => {
    const [w, h] = kind === 'panorama' ? [4320, 1800] : [1200, 1800]
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    // A fixed seed, so every recording shows the same picture.
    let seed = kind === 'panorama' ? 7 : 11
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

    if (kind === 'panorama') {
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62)
      sky.addColorStop(0, '#1d2b64')
      sky.addColorStop(0.45, '#7b4397')
      sky.addColorStop(0.8, '#f8875f')
      sky.addColorStop(1, '#ffd27a')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)
      const sun = { x: w * 0.62, y: h * 0.5 }
      const glow = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, 520)
      glow.addColorStop(0, 'rgba(255, 244, 200, 1)')
      glow.addColorStop(0.25, 'rgba(255, 214, 140, 0.8)')
      glow.addColorStop(1, 'rgba(255, 180, 120, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)
      const ridges = [
        { base: 0.5, height: 0.2, color: '#8e5a8f' },
        { base: 0.56, height: 0.17, color: '#5b3b6e' },
        { base: 0.62, height: 0.14, color: '#2f2346' },
      ]
      for (const r of ridges) {
        const phase = rand() * 10
        ctx.fillStyle = r.color
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let x = 0; x <= w; x += 24) {
          const t = x / w
          const y =
            h * r.base -
            h * r.height * (0.55 + 0.3 * Math.sin(t * 9 + phase) + 0.15 * Math.sin(t * 31 + phase * 2)) +
            rand() * 10
          ctx.lineTo(x, y)
        }
        ctx.lineTo(w, h)
        ctx.fill()
      }
      const lake = ctx.createLinearGradient(0, h * 0.62, 0, h)
      lake.addColorStop(0, '#f2a46b')
      lake.addColorStop(0.3, '#6a3f73')
      lake.addColorStop(1, '#151129')
      ctx.fillStyle = lake
      ctx.fillRect(0, h * 0.62, w, h * 0.38)
      ctx.fillStyle = 'rgba(255, 236, 190, 0.55)'
      for (let i = 0; i < 26; i++) {
        const y = h * 0.64 + i * 22
        const half = 240 - i * 8 + rand() * 40
        ctx.fillRect(sun.x - half, y, half * 2, 5)
      }
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, '#5aa9e6')
      sky.addColorStop(0.7, '#bfe0f5')
      sky.addColorStop(1, '#ffe3c9')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      for (let i = 0; i < 9; i++) {
        const cx = rand() * w
        const cy = h * (0.15 + rand() * 0.7)
        for (let k = 0; k < 5; k++) {
          ctx.beginPath()
          ctx.ellipse(cx + (k - 2) * 60, cy + rand() * 20, 90 + rand() * 50, 40 + rand() * 20, 0, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      const c = { x: w / 2, y: h * 0.4 }
      const r = 330
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(c.x - r * 0.42, c.y + r * 1.05)
      ctx.bezierCurveTo(c.x - r * 1.25, c.y + r * 0.45, c.x - r * 1.1, c.y - r, c.x, c.y - r)
      ctx.bezierCurveTo(c.x + r * 1.1, c.y - r, c.x + r * 1.25, c.y + r * 0.45, c.x + r * 0.42, c.y + r * 1.05)
      ctx.closePath()
      ctx.clip()
      const stripes = ['#e63946', '#f4a261', '#ffd166', '#2a9d8f', '#457b9d', '#e63946', '#f4a261', '#ffd166']
      const sw = (r * 2.4) / stripes.length
      stripes.forEach((color, i) => {
        ctx.fillStyle = color
        ctx.fillRect(c.x - r * 1.2 + i * sw, c.y - r, sw + 1, r * 2.2)
      })
      const shade = ctx.createLinearGradient(c.x - r, 0, c.x + r, 0)
      shade.addColorStop(0, 'rgba(0, 0, 0, 0.25)')
      shade.addColorStop(0.45, 'rgba(255, 255, 255, 0.15)')
      shade.addColorStop(1, 'rgba(0, 0, 0, 0.3)')
      ctx.fillStyle = shade
      ctx.fillRect(c.x - r * 1.3, c.y - r, r * 2.6, r * 2.2)
      ctx.restore()
      ctx.strokeStyle = '#5c4033'
      ctx.lineWidth = 5
      for (const dx of [-0.42, 0.42]) {
        ctx.beginPath()
        ctx.moveTo(c.x + r * dx, c.y + r * 1.05)
        ctx.lineTo(c.x + r * dx * 0.45, c.y + r * 1.45)
        ctx.stroke()
      }
      ctx.fillStyle = '#8b5a2b'
      ctx.fillRect(c.x - r * 0.22, c.y + r * 1.45, r * 0.44, r * 0.3)
    }
    return canvas.toDataURL('image/jpeg', 0.9)
  }, kind)
  return { name: `${kind}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64') }
}
