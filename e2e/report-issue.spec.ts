import { expect, test } from '@playwright/test'

// "Report an issue" opens a new GitHub issue in a new tab, filled in with where it came from.
// GitHub itself is stubbed out, so the test never leaves the machine.

test.beforeEach(async ({ context }) => {
  await context.route('https://github.com/**', (route) => route.fulfill({ status: 200, body: 'GitHub' }))
})

test('the bar’s flag opens an issue that says which tool and mode it came from', async ({ page, context }) => {
  await page.goto('collage')
  await page.getByRole('button', { name: 'Studio', exact: true }).click()
  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'Report an issue on GitHub' }).click(),
  ])
  const url = new URL(tab.url())
  expect(`${url.origin}${url.pathname}`).toBe('https://github.com/ShaneRich5/stitcher/issues/new')
  expect(url.searchParams.get('title')).toBe('Collage: ')
  const body = url.searchParams.get('body')!
  expect(body).toContain('- Where: Collage (Studio)')
  expect(body).toContain('- Page: /stitcher/collage')
  expect(body).toMatch(/- Build: index-[\w-]+\.js/)
  expect(body).toContain('- Screen: 1400 × 900')
})

test('the home page’s footer links to it too', async ({ page, context }) => {
  await page.goto('')
  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.landing-footer').getByRole('link', { name: 'Report an issue' }).click(),
  ])
  expect(new URL(tab.url()).searchParams.get('body')).toContain('- Where: Home page')
})
