import { expect, test, type Page } from '@playwright/test'

// The GIF and Collage tools open on a sample, the way their designs show them, and the first
// photos you add replace it.

/** A plain photo made in the page, so the tests need no image files. */
async function photo(page: Page, name: string, color: string) {
  const dataUrl = await page.evaluate((c) => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 1000
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = c
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  }, color)
  return { name, mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64') }
}

const readout = (page: Page) => page.locator('.nav-readout')

test.describe('GIF first visit', () => {
  test('opens on the six-frame sample, playing', async ({ page }) => {
    await page.goto('gif')
    await expect(readout(page)).toHaveText(/^6 frames/)
    await expect(page.getByRole('button', { name: 'Pause' }).first()).toBeVisible()
    await expect(page.locator('.empty-state')).toHaveCount(0)
  })

  test('your first frames replace the sample, and later ones add to them', async ({ page }) => {
    await page.goto('gif')
    await expect(readout(page)).toHaveText(/^6 frames/)
    const input = page.locator('input[type=file]').first()
    await input.setInputFiles([await photo(page, 'a.png', '#2a9d8f'), await photo(page, 'b.png', '#e76f51')])
    await expect(readout(page)).toHaveText(/^2 frames/)
    await input.setInputFiles(await photo(page, 'c.png', '#264653'))
    await expect(readout(page)).toHaveText(/^3 frames/)
  })

  test('Start over brings the sample back', async ({ page }) => {
    await page.goto('gif')
    await page.locator('input[type=file]').first().setInputFiles(await photo(page, 'a.png', '#2a9d8f'))
    await expect(readout(page)).toHaveText(/^1 frame\b/)
    await page.getByRole('button', { name: 'Start over' }).first().click()
    await page.getByRole('alertdialog', { name: 'Start over?' }).getByRole('button', { name: 'Start over' }).click()
    await expect(readout(page)).toHaveText(/^6 frames/)
  })
})

test.describe('Collage first visit', () => {
  test('opens on the five-photo sample, cut out already and playing', async ({ page }) => {
    await page.goto('collage')
    await expect(readout(page)).toHaveText(/^5 photos/)
    for (const name of ['lake.jpg', 'ridge.jpg', 'trail.jpg', 'dusk.jpg', 'harbor.jpg']) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
    }
    await expect(page.getByRole('button', { name: /^Export MP4/ })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Pause' }).first()).toBeVisible()
  })

  test('your first photos replace the sample', async ({ page }) => {
    // Keep the background remover from downloading; the photo's cutout just fails.
    await page.route('**/huggingface.co/**', (route) => route.abort())
    await page.goto('collage')
    await expect(readout(page)).toHaveText(/^5 photos/)
    await page.locator('.quick > input[type=file]').setInputFiles(await photo(page, 'mine.png', '#2a9d8f'))
    await expect(readout(page)).toHaveText(/^1 photo\b/)
    await expect(page.getByText('lake.jpg', { exact: true })).toHaveCount(0)
  })
})
