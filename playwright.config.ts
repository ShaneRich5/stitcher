import { defineConfig, devices } from '@playwright/test'

// End-to-end tests drive the production build, served the way GitHub Pages serves it (under /stitcher/).
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } }],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort --base /stitcher/',
    url: 'http://localhost:4173/stitcher/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
