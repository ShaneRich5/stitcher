import { choose, clickOn, expect, glide, pause, say, scenery, test } from './demo-kit'

test('Split a panorama into a carousel', async ({ page }) => {
  await page.goto('carousel')
  await say(page, 'Start with one wide photo')
  await choose(page, page.getByText('Choose a photo'), await scenery(page, 'panorama'))
  await expect(page.locator('.stage-canvas canvas').first()).toBeVisible()
  await say(page, 'Stitcher slices it into slides that swipe as one picture', 2200)

  const strip = (await page.locator('.slide-strip').first().boundingBox())!
  await glide(page, { x: strip.x + strip.width * 0.2, y: strip.y + strip.height / 2 })
  await glide(page, { x: strip.x + strip.width * 0.8, y: strip.y + strip.height / 2 })
  await say(page, 'These are exactly the slides that get posted')

  await say(page, 'Need a longer swipe? Add a slide and the photo spreads across it', 1200)
  await clickOn(page, page.getByRole('button', { name: 'One more slide' }).first())
  await pause(page, 1200)

  await say(page, 'Preview it the way people will swipe through it', 1200)
  await clickOn(page, page.getByRole('button', { name: 'Preview' }))
  const next = page.getByRole('button', { name: 'Next slide' })
  const counter = page.getByRole('dialog', { name: 'Swipe preview' }).locator('.preview-head span')
  for (let i = 2; i <= 4; i++) {
    await clickOn(page, next)
    await expect(counter).toHaveText(`${i} / 4`)
    await pause(page, 700)
  }
  await clickOn(page, page.getByRole('button', { name: 'Close preview' }))
  await say(page, null)
  await pause(page, 800)
})
