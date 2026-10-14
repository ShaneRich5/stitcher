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

  test('Start over goes to the landing page', async ({ page }) => {
    await page.goto('gif')
    await page.locator('input[type=file]').first().setInputFiles(await photo(page, 'a.png', '#2a9d8f'))
    await expect(readout(page)).toHaveText(/^1 frame /)
    await page.getByRole('button', { name: 'Start over' }).first().click()
    await page.getByRole('alertdialog', { name: 'Start over?' }).getByRole('button', { name: 'Start over' }).click()
    await expect(page.getByRole('heading', { name: 'A few photos. One loop.' })).toBeVisible()
    await expect(readout(page)).toHaveText('No frames')
  })
})

test.describe('GIF quick guide', () => {
  test('walks the example in five steps, then later visits open on the landing page', async ({ page }) => {
    await page.goto('gif')
    const guide = page.getByRole('dialog', { name: 'GIF quick guide' })
    await expect(guide).toContainText('1 of 5')
    await expect(guide).toContainText('This is an example')
    for (let i = 2; i <= 5; i++) {
      await guide.getByRole('button', { name: 'Next' }).click()
      await expect(guide).toContainText(`${i} of 5`)
    }
    await guide.getByRole('button', { name: 'Back' }).click()
    await expect(guide).toContainText('4 of 5')
    await guide.getByRole('button', { name: 'Next' }).click()
    await guide.getByRole('button', { name: 'Got it' }).click()
    await expect(guide).toHaveCount(0)
    // The example stays to play with until it's replaced.
    await expect(readout(page)).toHaveText(/^6 frames/)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'A few photos. One loop.' })).toBeVisible()
    await expect(guide).toHaveCount(0)
  })

  test('Show me an example turns the example and its guide back on', async ({ page }) => {
    await page.goto('gif')
    await page.getByRole('dialog', { name: 'GIF quick guide' }).getByRole('button', { name: 'Skip guide' }).click()
    await page.reload()
    await page.getByRole('button', { name: 'Show me an example' }).click()
    await expect(readout(page)).toHaveText(/^6 frames/)
    await expect(page.getByRole('dialog', { name: 'GIF quick guide' })).toContainText('1 of 5')
  })

  test('the landing page takes photos, and Escape closes the guide', async ({ page }) => {
    await page.goto('gif')
    await expect(page.getByRole('dialog', { name: 'GIF quick guide' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'GIF quick guide' })).toHaveCount(0)
    await page.reload()
    await page
      .locator('.welcome input[type=file]')
      .setInputFiles([await photo(page, 'a.png', '#2a9d8f'), await photo(page, 'b.png', '#e76f51')])
    await expect(readout(page)).toHaveText(/^2 frames/)
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

test.describe('Collage quick guide', () => {
  test('after the guide, an empty collage is the landing page, and the example comes back from it', async ({ page }) => {
    await page.goto('collage')
    const guide = page.getByRole('dialog', { name: 'Collage quick guide' })
    await expect(guide).toContainText('1 of 5')
    await guide.getByRole('button', { name: 'Skip guide' }).click()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Stack photos into a video.' })).toBeVisible()
    await page.getByRole('button', { name: 'Show me an example' }).click()
    await expect(readout(page)).toHaveText(/^5 photos/)
    await expect(guide).toContainText('1 of 5')
  })
})
