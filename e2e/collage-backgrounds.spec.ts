import { expect, test } from '@playwright/test'

// Photos fade back out behind their subjects by default, and Quick's switch and Studio's choice
// both change it. How the fade looks is covered by the unit tests on `backgroundAlpha`.

test('photos fade out by default, and Quick and Studio both switch it', async ({ page }) => {
  // Keep the background remover from downloading; the photo's cutout just fails.
  await page.route('**/huggingface.co/**', (route) => route.abort())
  await page.goto('collage')
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 1600
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#2a9d8f'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  })
  await page
    .locator('.quick > input[type=file]')
    .setInputFiles({ name: 'mine.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64') })

  const fade = page.getByRole('switch', { name: /^Fade out/ })
  await expect(fade).toHaveAttribute('aria-checked', 'true')
  await expect(fade).toContainText('Ends on the subjects')
  await fade.click()
  await expect(fade).toHaveAttribute('aria-checked', 'false')
  await expect(fade).toContainText('Ends on the last photo')

  await page.getByRole('button', { name: 'Studio', exact: true }).click()
  const behind = page.getByRole('group', { name: 'Photos behind' })
  await expect(behind.getByRole('button', { name: 'Stay' })).toHaveAttribute('aria-pressed', 'true')
  await behind.getByRole('button', { name: 'Fade out' }).click()
  await expect(behind.getByRole('button', { name: 'Fade out' })).toHaveAttribute('aria-pressed', 'true')
})
