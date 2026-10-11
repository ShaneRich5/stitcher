// Carousel: Choose subject on two touching players; tap one, cut it out, and compare with plain
// Remove background. First run downloads SlimSAM (~14 MB) and RMBG (~44 MB) on the CPU path.
import { footballToWorld, photo, run, shot, worldToPage } from './common.mjs'

await run('', async (page) => {
  /** Screenshot of an area of the photo (in its pixels), clipped to the slides. */
  const crop = async (name, x0, y0, x1, y1) => {
    const a = footballToWorld(x0, y0)
    const b = footballToWorld(x1, y1)
    const p = await worldToPage(page, a.x, Math.max(0, a.y))
    const q = await worldToPage(page, b.x, Math.min(1350, b.y))
    await shot(page, name, { clip: { x: p.x, y: p.y, width: q.x - p.x, height: q.y - p.y } })
  }
  const settle = async () => {
    await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 300_000 })
    await page.mouse.click(5, 300) // deselect, so the selection box doesn't cover the edges
    await page.waitForTimeout(300)
  }

  await page.locator('.empty-state input[type=file]').setInputFiles(await photo('football-match.jpg'))
  await page.locator('.image-controls').waitFor()

  await page.locator('summary[aria-label="Cut out"]').click()
  await page.getByRole('button', { name: /Choose subject/ }).click()
  const t0 = Date.now()
  await page.locator('.picker-hint', { hasText: 'Tap the subject' }).waitFor({ timeout: 300_000 })
  console.log(`picker ready after ${Date.now() - t0} ms`)

  // Tap number 30's chest: SAM should pick the whole player, not the logo.
  const tap = footballToWorld(510, 250)
  const at = await worldToPage(page, tap.x, tap.y)
  const t1 = Date.now()
  await page.mouse.click(at.x, at.y)
  await page.waitForFunction(() => !document.querySelector('.picker-action')?.disabled, null, { timeout: 60_000 })
  console.log(`mask after ${Date.now() - t1} ms`)
  await shot(page, 'choose-1-preview')

  await page.getByRole('button', { name: 'Remove background' }).click()
  await settle()
  await crop('choose-2-chosen', 400, 40, 660, 533)

  // Today's Remove background on the same photo, for comparing edges.
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  await page.locator('.stage-canvas canvas').first().click({ position: { x: 700, y: 300 } })
  await page.locator('summary[aria-label="Cut out"]').click()
  await page.getByRole('button', { name: /^Remove background/ }).click()
  await settle()
  await crop('choose-3-plain', 400, 40, 660, 533)
})
