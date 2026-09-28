# Architecture

Stitcher is a static single-page app. It has no backend, and all image work happens in the browser
through Canvas, Konva and WebCodecs. It deploys to GitHub Pages on every push to `main`.

```
src/
  main.tsx                    Router bootstrap
  routes/                     File-based routes (TanStack). routeTree.gen.ts is generated.
    __root.tsx                Root route -> RootLayout
    index.tsx                 /     -> StitcherEditor
    gif.tsx                   /gif  -> GifMaker
  components/
    root-layout.tsx           App shell; each tool renders its own <AppNav> with its actions
    stitcher-editor.tsx       Carousel tool: state, handlers, keyboard, drag/drop, paste, export
    carousel-stage.tsx        Konva stage: slides, layers, snapping, transformer
    carousel-controls.tsx     Whole-carousel controls (slides, format, split, style, export type)
    image-controls.tsx        Selected-image controls (floating toolbar / phone sheet)
    slide-strip.tsx           Thumbnails of the slides as posted
    swipe-preview.tsx         Feed-style swipe preview dialog
    icons.tsx, app-nav.tsx    Shared UI
    gif-maker.tsx             GIF/video tool
  lib/
    carousel.ts               Doc helpers: makeLayer, zoom, relayout, slide add/remove
    snap-guides.ts            Snap targets and snapBox()
    render-slide.ts           Canvas render of one slide from source pixels
    export-carousel.ts        Slide/grid files, ZIP, Web Share
    use-editor-history.ts     Immutable undo/redo with coalescing
    use-slide-thumbnails.ts   Debounced thumbnails
    encode-gif.ts, encode-video.ts   GIF and MP4/WebM encoders
  types.ts                    Layer, CarouselDoc, FitMode
```

## Data model

```ts
CarouselDoc { slideW, slideH, count, gridCols, gridRows, background: string | null, layers }
Layer { id, name, url, image, x, y, width, height, rotation, flipX, fit, lockAspect }
```

- All slides share one size. The slides sit edge to edge in one world space, so a layer's `x`
  can cover several slides.
- `x, y, width, height` describe the unrotated box (top-left, world pixels). `rotation` and
  `flipX` apply around the box center.
- `fit` is `fill` (cover the row), `fit` (contain in the row) or `free` (placed by hand).
  Fill and fit layers rescale with the row when the slide count or format changes, through
  `relayout`. Free layers scale with the slide size and are dropped if left past the last slide.

## Stage and export

- The Konva stage draws each layer twice: a faded, interactive copy (the Transformer target)
  and a full-opacity copy clipped to the slides.
- Export does not read the stage. `renderSlide` redraws each slide from the source image
  pixels, so output is full resolution regardless of the on-screen zoom. Grid cutting crops
  that canvas. Files go into one ZIP (or a single file), or to the share sheet on phones.

## State

All editing goes through `commit` in `useEditorHistory`. Rapid edits (sliders, arrow nudges,
drags) pass a `coalesce` key so they form one undo step (1 second window, 80 steps).

## Conventions

- Lint uses the React Compiler rules: no ref reads during render, no synchronous `setState`
  in effects.
- No backend, accounts or persistence layer (see `.cursorrules`).
- DOM-free logic in `lib/` (carousel, snap-guides, export naming) is kept separable so it can
  move to a shared package if an Expo app happens (see the roadmap).
