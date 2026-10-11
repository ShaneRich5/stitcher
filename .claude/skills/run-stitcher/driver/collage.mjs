// Collage: cut out two photos, grab preview frames with parallax on and off, and export the MP4.
// Compare a frame with the export: ffmpeg -i shots/collage.mp4 -vf "select=eq(n\,78)" -vframes 1 out.png
import { writeFileSync } from 'node:fs'
import { photo, run, setRange, SHOTS } from './common.mjs'

await run('collage', async (page) => {
  /** The preview canvas's own pixels at `ms`. */
  const frameAt = async (ms, name) => {
    await setRange(page, '.collage-scrub', ms)
    await page.waitForTimeout(150)
    const url = await page.evaluate(() => document.querySelector('.collage-canvas').toDataURL('image/png'))
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'))
    console.log('frame', `${SHOTS}/${name}.png`)
  }
  const parallax = '.popover-panel input[type=range][max="1"]'

  await page
    .locator('.empty-state input[type=file]')
    .setInputFiles([await photo('man-on-car.jpg'), await photo('football-match.jpg')])
  // The cutouts are done once export is enabled.
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Export (MP4|WebM)/.test(x.textContent))
    return b && !b.disabled
  }, null, { timeout: 300_000 })
  await page.keyboard.press(' ') // pause the autoplay

  // With the default timing, photo 1 moves from 0 ms until photo 2's background covers it (2650 ms).
  await frameAt(1200, 'collage-1200-on')
  await frameAt(2600, 'collage-2600-on')
  await page.locator('summary', { hasText: 'Style' }).click()
  await setRange(page, parallax, 0)
  await frameAt(2600, 'collage-2600-off')
  await setRange(page, parallax, 0.5)
  await page.keyboard.press('Escape')

  const download = page.waitForEvent('download', { timeout: 300_000 })
  await page.locator('button', { hasText: /Export (MP4|WebM)/ }).click()
  await (await download).saveAs(`${SHOTS}/collage.mp4`)
  console.log('exported', `${SHOTS}/collage.mp4`)
})
