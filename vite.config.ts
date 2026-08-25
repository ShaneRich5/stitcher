import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

/** GitHub Pages serves a custom 404.html for unknown paths — use the SPA shell. */
function githubPagesSpaFallback(): Plugin {
  let outDir = 'dist'
  return {
    name: 'github-pages-spa-fallback',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const indexHtml = join(outDir, 'index.html')
      if (existsSync(indexHtml)) {
        copyFileSync(indexHtml, join(outDir, '404.html'))
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Repo Pages URL: https://shanerich5.github.io/stitcher/
  base: command === 'build' ? '/stitcher/' : '/',
  plugins: [
    // Must come before @vitejs/plugin-react
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    githubPagesSpaFallback(),
  ],
}))
