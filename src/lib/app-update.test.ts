import { describe, expect, it } from 'vitest'
import { entryScript, failureMessage, isStale, isStaleLoad, STALE_MESSAGE } from './app-update'

describe('isStaleLoad', () => {
  it('knows each browser’s words for a lazily loaded file that is gone', () => {
    const gone = [
      'Failed to fetch dynamically imported module: https://shanerich5.github.io/stitcher/assets/transformers.web-DlJFE-8I.js',
      'error loading dynamically imported module: https://example.com/a.js',
      'Importing a module script failed.',
      'Unable to preload CSS for /stitcher/assets/a.css',
    ]
    for (const message of gone) expect(isStaleLoad(new TypeError(message))).toBe(true)
  })

  it('leaves other failures alone', () => {
    expect(isStaleLoad(new Error('Could not decode a saved image'))).toBe(false)
    expect(isStaleLoad(null)).toBe(false)
  })
})

describe('failureMessage', () => {
  it('keeps the usual message for other failures', () => {
    expect(failureMessage(new Error('boom'), 'Could not remove the background')).toBe('Could not remove the background')
    expect(isStale()).toBe(false)
  })

  it('says to reload, and flags the page as stale, when an old build is the cause', () => {
    const e = new TypeError('Failed to fetch dynamically imported module: /stitcher/assets/x.js')
    expect(failureMessage(e, 'Could not remove the background')).toBe(STALE_MESSAGE)
    expect(isStale()).toBe(true)
  })
})

describe('entryScript', () => {
  it('finds the built entry script in the page', () => {
    const html =
      '<head><script type="module" crossorigin src="/stitcher/assets/index-B5uVGA1I.js"></script>' +
      '<link rel="stylesheet" crossorigin href="/stitcher/assets/index-Cx1.css"></head>'
    expect(entryScript(html)).toBe('/stitcher/assets/index-B5uVGA1I.js')
  })

  it('finds nothing in the dev server’s page', () => {
    expect(entryScript('<script type="module" src="/src/main.tsx"></script>')).toBeNull()
  })
})
