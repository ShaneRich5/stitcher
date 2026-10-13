import { expect, test } from '@playwright/test'

// The swipe preview pages with its arrow buttons, not just by swiping or the keyboard.

test('the preview arrows page through the slides', async ({ page }) => {
  await page.goto('carousel')
  const photo = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 3000
    canvas.height = 1250
    const ctx = canvas.getContext('2d')!
    const sky = ctx.createLinearGradient(0, 0, canvas.width, 0)
    sky.addColorStop(0, '#1d2b64')
    sky.addColorStop(1, '#f8875f')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  })
  await page
    .locator('.welcome input[type=file]')
    .setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1]!, 'base64') })
  await page.getByRole('button', { name: 'Preview' }).click()

  const dialog = page.getByRole('dialog', { name: 'Swipe preview' })
  const counter = dialog.locator('.preview-head span')
  await expect(counter).toHaveText('1 / 3')
  await dialog.getByRole('button', { name: 'Next slide' }).click()
  await expect(counter).toHaveText('2 / 3')
  await dialog.getByRole('button', { name: 'Next slide' }).click()
  await expect(counter).toHaveText('3 / 3')
  await expect(dialog.getByRole('button', { name: 'Next slide' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Previous slide' }).click()
  await expect(counter).toHaveText('2 / 3')
})
