import { expect, test, type Page } from '@playwright/test'
import { layerBox, SLIDE_H, SLIDE_W, toPage, type Box } from './support/carousel'

// Carousel snapping and resizing, checked on what the stage actually draws. The photo is solid
// red on the white slides, so a pixel says whether the full-opacity (exported) copy covers it:
// red is covered, pink is only the faded copy you grab, white is nothing.

/** A solid red PNG, made in the page so the tests need no image files. */
async function redPhoto(page: Page, width: number, height: number) {
  const dataUrl = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, w, h)
      return canvas.toDataURL('image/png')
    },
    [width, height],
  )
  return { name: 'red.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64') }
}

/** Press at one world point and drag to another in small steps, as a hand would. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const a = await toPage(page, from.x, from.y)
  const b = await toPage(page, to.x, to.y)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 12 })
  await page.mouse.up()
}

/** What the stage drew at a world point: 'red', 'pink' (faded copy only) or 'white'. */
async function colorAt(page: Page, wx: number, wy: number): Promise<string> {
  const p = await toPage(page, wx, wy)
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('.stage-canvas canvas')!
    const r = canvas.getBoundingClientRect()
    const k = canvas.width / r.width
    const [red, green, blue] = canvas.getContext('2d')!.getImageData(Math.round((x - r.left) * k), Math.round((y - r.top) * k), 1, 1).data
    if (red > 200 && green < 60 && blue < 60) return 'red'
    if (red > 200 && green > 230 && blue > 230) return 'white'
    return red > 200 ? 'pink' : `rgb(${red}, ${green}, ${blue})`
  }, p)
}

/** Points inset into a box's corners, clear of the selection's border and handles. */
function insideCorners(b: Box, inset = 0.15) {
  const dx = b.width * inset
  const dy = b.height * inset
  return [
    { x: b.x + dx, y: b.y + dy },
    { x: b.x + b.width - dx, y: b.y + dy },
    { x: b.x + dx, y: b.y + b.height - dy },
    { x: b.x + b.width - dx, y: b.y + b.height - dy },
  ]
}

/** A free red photo, 2:3, in the middle slide, selected in Studio. It starts at 1206, 54, 828 × 1242. */
async function openWithPhoto(page: Page) {
  await page.goto('carousel')
  await page.locator('.welcome input[type=file]').setInputFiles(await redPhoto(page, 600, 900))
  await page.getByRole('button', { name: 'Studio' }).click()
  await page.getByRole('button', { name: 'Free', exact: true }).click()
  await expect.poll(() => layerBox(page)).toEqual({ x: 1206, y: 54, width: 828, height: 1242 })
}

test.describe('carousel resize', () => {
  test('the drawn image fills its border after shrinking and growing', async ({ page }) => {
    await openWithPhoto(page)

    // Shrink from the bottom-right corner.
    let b = await layerBox(page)
    await drag(page, { x: b.x + b.width, y: b.y + b.height }, { x: b.x + b.width - 250, y: b.y + b.height - 375 })
    b = await layerBox(page)
    expect(b.width).toBeLessThan(700)
    for (const p of insideCorners(b)) expect(await colorAt(page, p.x, p.y)).toBe('red')

    // Grow it again, past where it started.
    await drag(page, { x: b.x + b.width, y: b.y + b.height }, { x: b.x + b.width + 150, y: b.y + b.height + 225 })
    b = await layerBox(page)
    for (const p of insideCorners(b)) expect(await colorAt(page, p.x, p.y)).toBe('red')
    // Just outside its right and bottom edges, on the slide and clear of the handles, nothing is drawn.
    expect(await colorAt(page, b.x + b.width + 50, b.y + b.height * 0.3)).toBe('white')
    expect(await colorAt(page, b.x + b.width * 0.3, b.y + b.height + 50)).toBe('white')
  })
})

test.describe('carousel snapping', () => {
  test('dragging snaps an edge onto the slide side', async ({ page }) => {
    await openWithPhoto(page)
    const b = await layerBox(page)
    const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    // Drop it with its left edge 12 world px right of the middle slide's left side.
    await drag(page, center, { x: center.x - (b.x - (SLIDE_W + 12)), y: center.y })
    await expect.poll(async () => (await layerBox(page)).x).toBe(SLIDE_W)
  })

  test('resizing snaps the dragged edge onto the slide side', async ({ page }) => {
    await openWithPhoto(page)
    const b = await layerBox(page)
    // Pull the right-middle handle to 10 world px short of the middle slide's right side.
    await drag(page, { x: b.x + b.width, y: b.y + b.height / 2 }, { x: 2 * SLIDE_W - 10, y: b.y + b.height / 2 })
    const after = await layerBox(page)
    expect(after.x + after.width).toBe(2 * SLIDE_W)
    for (const p of insideCorners(after)) expect(await colorAt(page, p.x, p.y)).toBe('red')
  })

  test('the Snap switch turns snapping off for the image', async ({ page }) => {
    await openWithPhoto(page)
    const snap = page.getByRole('button', { name: 'Snap', exact: true })
    await expect(snap).toHaveAttribute('aria-pressed', 'true')
    await snap.click()
    await expect(snap).toHaveAttribute('aria-pressed', 'false')

    const b = await layerBox(page)
    const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    await drag(page, center, { x: center.x - (b.x - (SLIDE_W + 12)), y: center.y })
    const after = await layerBox(page)
    expect(after.x).not.toBe(SLIDE_W)
    expect(Math.abs(after.x - (SLIDE_W + 12))).toBeLessThan(6)
  })

  test('Fill this slide covers the slide exactly, without spilling, and undoes in one step', async ({ page }) => {
    await openWithPhoto(page)
    const before = await layerBox(page)
    await page.getByRole('button', { name: 'Fill this slide' }).click()
    await expect.poll(() => layerBox(page)).toEqual({ x: SLIDE_W, y: 0, width: SLIDE_W, height: SLIDE_H })

    for (const p of insideCorners({ x: SLIDE_W, y: 0, width: SLIDE_W, height: SLIDE_H }, 0.03)) {
      expect(await colorAt(page, p.x, p.y)).toBe('red')
    }
    // The slides either side stay clear.
    expect(await colorAt(page, SLIDE_W - 40, SLIDE_H / 2)).toBe('white')
    expect(await colorAt(page, 2 * SLIDE_W + 40, SLIDE_H / 2)).toBe('white')

    await page.keyboard.press('Control+z')
    await expect.poll(() => layerBox(page)).toEqual(before)
  })
})
