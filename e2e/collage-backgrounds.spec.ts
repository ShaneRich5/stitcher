import { expect, test } from '@playwright/test'

// The collage opens in the Instagram style; Quick's style menu and Studio's Timing switch it to
// either stack, and only the stacks show their depth and overlay controls. How each style looks is
// covered by the unit tests on `instagramFrame` and `backgroundAlpha`.

test('the Instagram collage is the default, and Quick and Studio switch styles', async ({ page }) => {
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

  const styleChip = page.locator('.quick-chips summary.quick-chip', { hasText: 'Instagram collage' })
  await expect(styleChip).toBeVisible()
  // The stacks' controls stay out of the way.
  await expect(page.getByRole('switch', { name: /Depth/ })).toHaveCount(0)
  await expect(page.getByLabel('Overlay color')).toHaveCount(0)

  await styleChip.click()
  const menu = page.getByRole('group', { name: 'Style' })
  await expect(menu.getByRole('button', { name: /Instagram collage/ })).toHaveAttribute('aria-pressed', 'true')
  await menu.getByRole('button', { name: /^Stack The subjects pile up while/ }).click()
  await expect(page.locator('.quick-chips summary.quick-chip', { hasText: 'Stack' })).toBeVisible()
  await expect(page.getByRole('switch', { name: /Depth/ })).toBeVisible()
  await expect(page.getByLabel('Overlay color')).toHaveCount(1)

  await page.getByRole('button', { name: 'Studio', exact: true }).click()
  const studioStyles = page.getByRole('group', { name: 'Style' })
  await expect(studioStyles.getByRole('button', { name: 'Stack', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await studioStyles.getByRole('button', { name: 'Stack + photos' }).click()
  await expect(studioStyles.getByRole('button', { name: 'Stack + photos' })).toHaveAttribute('aria-pressed', 'true')
  await studioStyles.getByRole('button', { name: 'Instagram' }).click()
  await expect(page.getByText('It loops: the last photo hands back to the first')).toBeVisible()
})
