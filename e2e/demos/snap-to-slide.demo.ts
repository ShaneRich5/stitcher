import { layerBox, SLIDE_W } from '../support/carousel'
import { choose, clickOn, dragWorld, expect, pause, say, scenery, test } from './demo-kit'

test('Snap photos to the slide sides', async ({ page }) => {
  await page.goto('carousel')
  await page.locator('.welcome input[type=file]').setInputFiles(await scenery(page, 'panorama'))
  await clickOn(page, page.getByRole('button', { name: 'Studio' }))
  await say(page, 'Add a second photo on top', 1200)
  await choose(page, page.getByRole('button', { name: 'Add images' }), await scenery(page, 'balloon'))
  await expect.poll(() => layerBox(page)).toMatchObject({ width: 828 })

  await say(page, 'Drag it near a slide’s side and it snaps into place')
  let b = await layerBox(page)
  const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  await dragWorld(page, center, { x: center.x + (SLIDE_W + 20 - b.x), y: center.y }, 1000)
  await expect.poll(async () => (await layerBox(page)).x).toBe(SLIDE_W)
  await pause(page)

  await say(page, 'Resizing snaps too: pull an edge to the side of the slide')
  b = await layerBox(page)
  await dragWorld(page, { x: b.x + b.width, y: b.y + b.height / 2 }, { x: 2 * SLIDE_W - 18, y: b.y + b.height / 2 }, 1000)
  await pause(page)

  await say(page, 'Want it loose? Turn Snap off for just this photo')
  await clickOn(page, page.getByRole('button', { name: 'Snap', exact: true }))
  b = await layerBox(page)
  const mid = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  await dragWorld(page, mid, { x: mid.x - 40, y: mid.y + 30 }, 600)
  await say(page, 'Now it goes exactly where you drop it')
  await clickOn(page, page.getByRole('button', { name: 'Snap', exact: true }))
  await say(page, null)
  await pause(page, 800)
})
