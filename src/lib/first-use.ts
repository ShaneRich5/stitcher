/** The tools that open on an example the first time. */
export type ExampleTool = 'gif' | 'collage'

const key = (tool: ExampleTool) => `stitcher.${tool}.example-seen`

/**
 * Whether this browser has been through a tool's example (its guide closed, or real photos added),
 * so later visits open on the landing page instead. A browser that blocks storage sees it each time.
 */
export function hasSeenExample(tool: ExampleTool): boolean {
  try {
    return localStorage.getItem(key(tool)) === '1'
  } catch {
    return false
  }
}

export function markExampleSeen(tool: ExampleTool): void {
  try {
    localStorage.setItem(key(tool), '1')
  } catch {
    // A browser that blocks storage just shows the example again next time.
  }
}
