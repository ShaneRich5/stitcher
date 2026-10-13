import { defineConfig, devices } from '@playwright/test'

// End-to-end tests drive the production build, served the way GitHub Pages serves it (under /stitcher/).
// Two projects: `chromium` is the test suite (npm run test:e2e, and CI); `demo` records the slower
// walkthroughs in e2e/demos to video (npm run demo), and never runs with the tests.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/stitcher/',
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: 'demos/**',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
    {
      name: 'demo',
      testMatch: 'demos/**/*.demo.ts',
      timeout: 120_000,
      retries: 0,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 900 },
        deviceScaleFactor: 1,
        video: { mode: 'on', size: { width: 1600, height: 900 } },
        trace: 'off',
      },
    },
  ],
  webServer: {
    // Builds first, so every run tests the current code. Never reuse a server already on the port:
    // it would be serving whatever build it started with.
    command: 'node e2e/support/serve.mjs',
    url: 'http://localhost:4173/stitcher/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
