// Carousel: a face on a slide edge is marked, Nudge clears it, and undo brings it back.
import { photo, run, shot } from './common.mjs'

await run('', async (page) => {
  const note = page.locator('.low-res-note', { hasText: /slide edge/ })
  await page.locator('.empty-state input[type=file]').setInputFiles(await photo('football-match.jpg'))
  await page.locator('.image-controls').waitFor()
  const t0 = Date.now()
  await note.waitFor({ timeout: 90_000 })
  console.log(`face note after ${Date.now() - t0} ms`)
  await shot(page, 'faces-1-marked')

  await page.getByRole('button', { name: 'Nudge' }).click()
  await page.waitForTimeout(400)
  if (await note.count()) throw new Error('Nudge left the face on the edge')
  await shot(page, 'faces-2-nudged')

  await page.keyboard.press('Control+z')
  await note.waitFor({ timeout: 5_000 })
  await shot(page, 'faces-3-undone')
})
