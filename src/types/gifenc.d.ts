declare module 'gifenc' {
  export type Palette = number[][]

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: string },
  ): Palette

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: string,
  ): Uint8Array

  export type GIFEncoderInstance = {
    writeFrame: (
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        palette?: Palette
        delay?: number
        repeat?: number
        transparent?: boolean
        transparentIndex?: number
      },
    ) => void
    finish: () => void
    bytes: () => Uint8Array
  }

  export function GIFEncoder(opts?: { auto?: boolean }): GIFEncoderInstance
}
