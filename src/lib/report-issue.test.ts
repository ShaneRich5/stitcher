import { describe, expect, it } from 'vitest'
import { issueUrl, REPO_URL, toolAt, type IssueContext } from './report-issue'

const ctx: IssueContext = {
  tool: 'GIF',
  mode: 'Studio',
  page: '/stitcher/gif',
  build: 'index-B5uVGA1I.js',
  browser: 'Mozilla/5.0 (Windows NT 10.0) Chrome/141.0',
  screen: '1440 × 900 at 2×',
}

describe('issueUrl', () => {
  it('opens a new issue on the repo, titled for the tool and labelled a bug', () => {
    const url = new URL(issueUrl(ctx))
    expect(`${url.origin}${url.pathname}`).toBe(`${REPO_URL}/issues/new`)
    expect(url.searchParams.get('title')).toBe('GIF: ')
    expect(url.searchParams.get('labels')).toBe('bug')
  })

  it('asks what happened, and fills in where, the build, the browser and the screen', () => {
    const body = new URL(issueUrl(ctx)).searchParams.get('body')!
    expect(body).toContain('**What happened?**')
    expect(body).toContain('**Steps to make it happen again**')
    expect(body).toContain('- Where: GIF (Studio)')
    expect(body).toContain('- Page: /stitcher/gif')
    expect(body).toContain('- Build: index-B5uVGA1I.js')
    expect(body).toContain('- Browser: Mozilla/5.0 (Windows NT 10.0) Chrome/141.0')
    expect(body).toContain('- Screen: 1440 × 900 at 2×')
  })

  it('reports from the home page without a tool', () => {
    const url = new URL(issueUrl({ ...ctx, tool: null, mode: null, page: '/stitcher/' }))
    expect(url.searchParams.get('title')).toBe('')
    expect(url.searchParams.get('body')).toContain('- Where: Home page')
  })
})

describe('toolAt', () => {
  it('finds the tool under the app’s base, with or without a trailing slash', () => {
    expect(toolAt('/stitcher/carousel')).toBe('carousel')
    expect(toolAt('/stitcher/collage/')).toBe('collage')
    expect(toolAt('/gif')).toBe('gif')
    expect(toolAt('/stitcher/')).toBeNull()
  })
})
