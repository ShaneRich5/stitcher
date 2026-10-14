import { expect, test } from '@playwright/test'

// After a deploy, a tab opened earlier asks for files that are gone. It should offer a reload
// rather than fail quietly.

async function addPhoto(page: import('@playwright/test').Page) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 1000
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#2a9d8f'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  })
  await page
    .locator('.welcome input[type=file]')
    .setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64') })
}

test('a cutout whose code was replaced by a deploy offers a reload', async ({ page }) => {
  // The cutout's model code, as if a deploy had replaced it since the page loaded.
  await page.route('**/assets/transformers*.js', (route) => route.fulfill({ status: 404, body: 'Not found' }))
  await page.goto('carousel')
  await addPhoto(page)
  await page.getByRole('button', { name: 'Studio', exact: true }).click()
  const remove = page.locator('.cutout-btn', { hasText: 'Remove background' })
  if (!(await remove.isVisible())) await page.getByRole('button', { name: 'Cut out', exact: true }).click()
  await remove.click()

  const banner = page.locator('.update-banner')
  await expect(banner).toContainText('Stitcher was updated since this page opened')
  await expect(page.locator('.toast')).toContainText('Reload to use this')
  await banner.getByRole('button', { name: 'Not now' }).click()
  await expect(banner).toHaveCount(0)
})

test('coming back to the tab after a deploy offers a reload before anything breaks', async ({ page }) => {
  await page.clock.install()
  await page.goto('carousel')
  await expect(page.locator('.welcome')).toBeVisible()
  // The live page now names a newer build.
  await page.route('**/stitcher/', async (route) => {
    const res = await route.fetch()
    const html = (await res.text()).replace(/assets\/index-[^"]+\.js/, 'assets/index-NEWBUILD.js')
    await route.fulfill({ response: res, body: html })
  })
  await page.clock.fastForward('06:00')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.locator('.update-banner')).toBeVisible()
  await expect(page.locator('.update-banner').getByRole('button', { name: 'Reload' })).toBeVisible()
})

test('a tab on the current build shows no banner', async ({ page }) => {
  await page.clock.install()
  await page.goto('carousel')
  await page.clock.fastForward('06:00')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(500)
  await expect(page.locator('.update-banner')).toHaveCount(0)
})
