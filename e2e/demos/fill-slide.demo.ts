import { layerBox, SLIDE_H, SLIDE_W } from '../support/carousel'
import { choose, clickOn, expect, pause, say, scenery, test } from './demo-kit'

test('Fill a slide with one photo', async ({ page }) => {
  await page.goto('carousel')
  await page.locator('.welcome input[type=file]').setInputFiles(await scenery(page, 'panorama'))
  await clickOn(page, page.getByRole('button', { name: 'Studio' }))
  await choose(page, page.getByRole('button', { name: 'Add images' }), await scenery(page, 'balloon'))
  await expect.poll(() => layerBox(page)).toMatchObject({ width: 828 })
  await pause(page)

  await say(page, 'Fill this slide makes a photo cover its slide edge to edge', 1400)
  await clickOn(page, page.getByRole('button', { name: 'Fill this slide' }))
  await expect.poll(() => layerBox(page)).toEqual({ x: 0, y: 0, width: SLIDE_W, height: SLIDE_H })
  await say(page, 'It’s cropped to the slide, so nothing spills onto the next one', 2200)

  await say(page, 'Changed your mind? It’s one step to undo', 1200)
  await clickOn(page, page.getByRole('button', { name: 'Undo' }))
  await expect.poll(() => layerBox(page)).toMatchObject({ x: 126, width: 828 })
  await say(page, 'Back where it was', 2000)
  await say(page, 'And one step to redo', 1000)
  await clickOn(page, page.getByRole('button', { name: 'Redo' }))
  await expect.poll(() => layerBox(page)).toMatchObject({ x: 0, width: SLIDE_W })
  await pause(page, 1500)
  await say(page, null)
  await pause(page, 800)
})
