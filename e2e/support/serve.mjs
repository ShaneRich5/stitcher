// Build the app, then serve dist/ under /stitcher/ the way GitHub Pages does, in this one process.
// Playwright starts this as its web server. Serving from the same process it starts (rather than
// through npm and npx) means stopping it stops the server too, so no stale server is left on the
// port to answer the next run with an old build.
import { execSync } from 'node:child_process'
import { preview } from 'vite'

execSync('npm run build', { stdio: 'inherit' })
const server = await preview({ base: '/stitcher/', preview: { port: 4173, strictPort: true } })
server.printUrls()
