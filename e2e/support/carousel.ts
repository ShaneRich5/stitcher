import type { Page } from '@playwright/test'

export type Box = { x: number; y: number; width: number; height: number }

/** A new carousel's slides: three of 1080 × 1350. */
export const SLIDE_W = 1080
export const SLIDE_H = 1350
export const COUNT = 3

/** World pixels to page pixels: the stage shows the row of slides plus a pad of max(96, 8%) all round. */
export async function toPage(page: Page, wx: number, wy: number, count = COUNT) {
  const canvas = (await page.locator('.stage-canvas canvas').first().boundingBox())!
  const padX = Math.max(96, Math.round(SLIDE_W * 0.08))
  const padY = Math.max(96, Math.round(SLIDE_H * 0.08))
  return {
    x: canvas.x + ((wx + padX) * canvas.width) / (SLIDE_W * count + padX * 2),
    y: canvas.y + ((wy + padY) * canvas.height) / (SLIDE_H + padY * 2),
  }
}

/** The selected layer's box, from Studio's inspector. */
export async function layerBox(page: Page): Promise<Box> {
  const field = async (label: string) =>
    Number(await page.locator('.num-field', { hasText: new RegExp(`^${label}`) }).locator('input').inputValue())
  return { x: await field('X'), y: await field('Y'), width: await field('W'), height: await field('H') }
}
