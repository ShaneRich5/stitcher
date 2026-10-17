/**
 * "Report an issue" opens a new GitHub issue with a short template and the details a fix needs:
 * where it happened, the build, the browser and the screen. Nothing from the user's work goes in,
 * so no photo or project ever leaves the device this way.
 */

export const REPO_URL = 'https://github.com/ShaneRich5/stitcher'

const TOOLS = { carousel: 'Carousel', gif: 'GIF', collage: 'Collage' } as const
type ToolId = keyof typeof TOOLS

export type IssueContext = {
  /** The tool the report came from, or null for the home page. */
  tool: (typeof TOOLS)[ToolId] | null
  mode: 'Quick' | 'Studio' | null
  page: string
  /** The built entry script's name, e.g. index-B5uVGA1I.js, or "dev". */
  build: string
  browser: string
  screen: string
}

/** The new-issue page for a report from `ctx`, with the template and its details filled in. */
export function issueUrl(ctx: IssueContext): string {
  const where = ctx.tool ? `${ctx.tool}${ctx.mode ? ` (${ctx.mode})` : ''}` : 'Home page'
  const body = [
    '**What happened?**',
    '',
    '',
    '**What did you expect to happen?**',
    '',
    '',
    '**Steps to make it happen again**',
    '1. ',
    '',
    '---',
    '<details><summary>Details, filled in by Stitcher</summary>',
    '',
    `- Where: ${where}`,
    `- Page: ${ctx.page}`,
    `- Build: ${ctx.build}`,
    `- Browser: ${ctx.browser}`,
    `- Screen: ${ctx.screen}`,
    '',
    '</details>',
  ].join('\n')
  const params = new URLSearchParams({ title: ctx.tool ? `${ctx.tool}: ` : '', body, labels: 'bug' })
  return `${REPO_URL}/issues/new?${params}`
}

/** The tool a path (under the app's base) belongs to, if any. */
export function toolAt(pathname: string): ToolId | null {
  const segment = pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  return segment in TOOLS ? (segment as ToolId) : null
}

/** Where a report from this page comes from, read when it's made. */
export function currentIssueContext(pathname: string): IssueContext {
  const tool = toolAt(pathname)
  let mode: IssueContext['mode'] = null
  if (tool) {
    try {
      mode = localStorage.getItem(`stitcher.${tool}.mode`) === 'studio' ? 'Studio' : 'Quick'
    } catch {
      mode = 'Quick'
    }
  }
  const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  return {
    tool: tool ? TOOLS[tool] : null,
    mode,
    page: pathname,
    build: entry ? (entry.src.split('/').pop() ?? 'unknown') : 'dev',
    browser: navigator.userAgent,
    screen: `${window.innerWidth} × ${window.innerHeight} at ${window.devicePixelRatio || 1}×`,
  }
}
