import { expect, test, type Page } from '@playwright/test'

// Adding a slide at the end leaves the slides you have exactly as they were.

async function photo(page: Page, name: string, color: string, width: number, height: number) {
  const dataUrl = await page.evaluate(
    ([c, w, h]) => {
      const canvas = document.createElement('canvas')
      canvas.width = w as number
      canvas.height = h as number
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = c as string
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    },
    [color, width, height],
  )
  return { name, mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64') }
}

/** The selected layer's box, from Studio's inspector. */
async function box(page: Page) {
  const field = async (label: string) =>
    Number(await page.locator('.num-field', { hasText: new RegExp(`^${label}`) }).locator('input').inputValue())
  return { x: await field('X'), y: await field('Y'), w: await field('W'), h: await field('H') }
}

test('adding a slide moves nothing, and a Fill photo that can no longer cover every slide turns Free', async ({ page }) => {
  await page.goto('carousel')
  // The first photo fills the row; a 2:3 photo can't reach a fourth slide without growing.
  await page.locator('.welcome input[type=file]').setInputFiles(await photo(page, 'back.png', '#e76f51', 600, 900))
  await page.getByRole('button', { name: 'Studio', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Fill slides' })).toHaveAttribute('aria-pressed', 'true')
  const back = await box(page)

  await page.locator('.studio-rail input[type=file]').setInputFiles(await photo(page, 'front.png', '#2a9d8f', 800, 1000))
  await expect(page.locator('.layers-panel').getByText('front.png')).toBeVisible()
  const front = await box(page)

  await page.locator('.post-panel').getByRole('button', { name: 'One more slide' }).click()
  await expect(page.locator('.post-panel .stepper output')).toHaveText('4')
  expect(await box(page)).toEqual(front)

  await page.locator('.layers-panel').getByText('back.png').click()
  expect(await box(page)).toEqual(back)
  await expect(page.getByRole('button', { name: 'Free', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // Picking Fill slides again spreads it over all four.
  await page.getByRole('button', { name: 'Fill slides' }).click()
  await expect.poll(async () => (await box(page)).w).toBe(4320)
})
