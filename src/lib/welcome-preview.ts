export type SliceLayout = {
  slideW: number
  slideH: number
  /** The scene's size and offset relative to the first slide; slide i shows it shifted left by i slides. */
  sceneW: number
  sceneH: number
  sceneX: number
  sceneY: number
}

/**
 * Fit `count` slides of `ratio` (width / height) into a box with `gap` between them, as large as
 * the box allows, then cover the whole row with a scene of `sceneRatio`, centred.
 */
export function fitSlices(
  count: number,
  ratio: number,
  box: { width: number; height: number },
  gap: number,
  sceneRatio: number,
): SliceLayout {
  const slideH = Math.max(0, Math.min(box.height, (box.width - (count - 1) * gap) / (count * ratio)))
  const slideW = slideH * ratio
  const rowW = slideW * count
  const sceneW = Math.max(rowW, slideH * sceneRatio)
  const sceneH = sceneW / sceneRatio
  return { slideW, slideH, sceneW, sceneH, sceneX: (rowW - sceneW) / 2, sceneY: (slideH - sceneH) / 2 }
}
