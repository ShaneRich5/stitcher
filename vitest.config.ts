import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.ts so tests don't run the router generator or the React Compiler.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
