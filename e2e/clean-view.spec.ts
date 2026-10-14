import { expect, test } from '@playwright/test'

// Clean view hides everything drawn over the slides, so the canvas shows only what's exported.

test('clean view hides the overlays and the handles, and turns back off', async ({ page }) => {
  await page.goto('carousel')
  // A white photo on the white slides: anything that isn't white is an overlay.
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 3000
    canvas.height = 1250
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  })
  await page
    .locator('.welcome input[type=file]')
    .setInputFiles({ name: 'white.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64') })
  await page.getByRole('button', { name: 'Studio', exact: true }).click()

  /** Pixels on the stage that differ from the slides' white, inside the row of slides. */
  const marks = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.stage-canvas canvas')!
      const { data, width, height } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
      let n = 0
      // The middle band of the canvas, inside the slides and clear of the pad around them.
      for (let y = Math.round(height * 0.3); y < height * 0.7; y += 2) {
        for (let x = Math.round(width * 0.15); x < width * 0.85; x += 2) {
          const i = (y * width + x) * 4
          if (data[i]! < 240 || data[i + 1]! < 240 || data[i + 2]! < 240) n++
        }
      }
      return n
    })

  // The seams between slides, at least, show while editing.
  await expect.poll(marks).toBeGreaterThan(50)

  const clean = page.getByRole('button', { name: 'Clean view' })
  await clean.click()
  await expect(clean).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(marks).toBe(0)
  await expect(page.getByRole('button', { name: 'Profile grid' })).toBeDisabled()

  await clean.click()
  await expect(clean).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(marks).toBeGreaterThan(50)
})
