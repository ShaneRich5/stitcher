# Architecture

Stitcher is a static single-page app. It has no backend, and all image work happens in the browser
through Canvas, Konva and WebCodecs, plus in-browser models for background removal, choosing a
subject, and finding faces.
It deploys to GitHub Pages on every push to `main`.

```
src/
  main.tsx                    Router bootstrap
  routes/                     File-based routes (TanStack). routeTree.gen.ts is generated.
    __root.tsx                Root route -> RootLayout
    index.tsx                 /     -> StitcherEditor
    gif.tsx                   /gif  -> GifMaker
    collage.tsx               /collage -> CollageMaker
  components/
    root-layout.tsx           App shell; each tool renders its own <AppNav> with its actions
    stitcher-editor.tsx       Carousel tool: state, handlers, keyboard, drag/drop, paste, export
    carousel-stage.tsx        Konva stage: slides, layers, snapping, transformer
    carousel-controls.tsx     Whole-carousel controls (slides, format, split, style, export type)
    image-controls.tsx        Selected-image controls (floating toolbar / phone sheet)
    slide-strip.tsx           Thumbnails of the slides as posted
    swipe-preview.tsx         Feed-style swipe preview dialog
    icons.tsx, app-nav.tsx    Shared UI
    gif-maker.tsx             GIF tool: state, playback, keyboard, drag/drop, paste, export
    gif-controls.tsx          Whole-animation controls (speed, size, format, style)
    frame-strip.tsx           Frame thumbnails; drag to reorder (default view)
    frame-timeline.tsx        Advanced view: frames sized by hold, ruler, playhead, per-frame timing
    collage-maker.tsx         Collage tool: cutout queue, playback, keyboard, drag/drop, paste, export
    collage-controls.tsx      Collage controls (format, export type, timing, overlay)
    collage-strip.tsx         Photo thumbnails with cutout status; drag to reorder
  lib/
    carousel.ts               Doc helpers: makeLayer, zoom, relayout, slide add/remove
    gif-doc.ts                GifDoc helpers: frame add/remove/reorder, fps <-> delay
    collage.ts                CollageDoc helpers, timing, and drawCollageFrame (preview + export)
    image-registry.ts         imageId -> decoded image, object URL and source blob
    idb.ts, persist-project.ts  IndexedDB autosave of the carousel
    snap-guides.ts            Snap targets and snapBox()
    render-slide.ts           Canvas render of one slide from source pixels
    remove-background.ts      Subject cutouts with RMBG-1.4 via Transformers.js, loaded on first use
    choose-subject.ts         Tap to choose the subject: SlimSAM picks which part of RMBG's mask to keep
    detect-faces.ts           Face boxes per image with MediaPipe's BlazeFace, loaded on first use
    face-edges.ts             Faces a slide edge splits, and the Nudge that clears them (DOM-free)
    layer-effects.ts          Outline, shadow and blur, drawn the same on the stage and in export
    export-carousel.ts        Slide/grid files, ZIP, Web Share
    use-editor-history.ts     Immutable undo/redo with coalescing
    use-slide-thumbnails.ts   Debounced thumbnails
    encode-gif.ts, encode-video.ts   GIF and MP4/WebM encoders (frame lists, or drawn timelines)
  types.ts                    Layer, CarouselDoc, FitMode, GifFrame, CollageItem
```

All three tools share one shell: `AppNav` actions, a `.split-bar` of controls, a `.workspace`, a
thumbnail strip, and a phone `.dock` with tabs. The styles live in `editor.css`.

## Data model

```ts
CarouselDoc { slideW, slideH, count, gridCols, gridRows, background: string | null, layers }
Layer { id, name, imageId, naturalWidth, naturalHeight,
        x, y, width, height, rotation, flipX, fit, lockAspect,
        outline?, shadow?, blur? }

GifDoc { frames, delayMs, holdLastMs, maxSize, background, reverse, loopOnce, format }
GifFrame { id, name, imageId, naturalWidth, naturalHeight, holdMs? }

CollageDoc { items, width, height, stepMs, backgroundDelayMs, fadeMs, holdEndMs, overlay, dim, parallax, format }
CollageItem { id, name, imageId, naturalWidth, naturalHeight, cutoutId: string | null, failed }
```

- `delayMs` is the shared speed; a frame's optional `holdMs` overrides it for that frame alone.
  `gif-doc.ts` derives the rest: `frameDurations` (per frame, no last-frame hold) is what export
  sends, and `playbackDurations` adds `holdLastMs` to whichever frame plays last, which is what
  the timeline draws and the preview times itself by — so the preview matches the exported file.
  Which frame plays last depends on `reverse`, so `lastPlayedIndex` decides it in one place.

- Both docs hold **plain data only**. Images are referenced by `imageId`; `lib/image-registry.ts`
  maps that id to the decoded `HTMLImageElement`, its object URL and the source blob. That keeps
  the docs JSON-serializable (so the carousel can autosave) and keeps the geometry in `lib/`
  free of the DOM.

- All slides share one size. The slides sit edge to edge in one world space, so a layer's `x`
  can cover several slides.
- `x, y, width, height` describe the unrotated box (top-left, world pixels). `rotation` and
  `flipX` apply around the box center.
- `fit` is `fill` (cover the row), `fit` (contain in the row) or `free` (placed by hand).
  Fill and fit layers rescale with the row when the slide count or format changes, through
  `relayout`. Free layers scale with the slide size and are dropped if left past the last slide.

## Collage

- Each item keeps two images: the photo (`imageId`) and its cutout (`cutoutId`), made by
  `removeBackground` one photo at a time through a queue in `collage-maker.tsx`. The cutout is the
  same size as the photo, and both are drawn into the same cover-fit box, so the subject sits
  exactly where it was in its photo.
- Item `i`'s subject starts at `i × stepMs` and fades in over `fadeMs`; its photo starts fading in
  `backgroundDelayMs` later. Earlier subjects stay, so they stack. The video ends `holdEndMs`
  after the last background is in (`collageDurationMs`).
- **Parallax** treats each photo and its cutout as two planes. From its subject appearing until the
  next background has covered its own, both zoom in around the subject's center (the centroid of
  the cutout's alpha, read once per cutout), the subject three times as far as the photo, so it
  seems nearer the camera. The photo still holds the subject and nothing fills the gap, so the moves
  stay small (at most 4% and 12%, times `parallax`); growing around the subject's center means the
  cutout covers its own ghost instead of sliding off it. No depth model is needed for this.
- `drawCollageFrame(ctx, doc, timeMs)` paints any moment. The preview canvas calls it on every
  animation frame and the export calls it for every video frame, so they match.
  `encodeTimelineVideo` draws and encodes one frame at a time at 30 fps, so a long video never
  holds more than one frame in memory.
- The collage isn't autosaved yet; like the GIF tool, its photos live in component state.

## Effects

A layer can carry an `outline`, a `shadow` and a `blur`, all optional (so older autosaves still
load) and all in world pixels, so they look the same at any zoom and scale with the format.
`drawLayerContent` in `layer-effects.ts` draws a layer into its own box, with the outline under the
image and the shadow falling from the outline when there is one. `renderSlide` calls it for the
thumbnails, the swipe preview and the export, and the stage calls it from each image node's
`sceneFunc` (hit testing stays the image's box), so all of them match.

- **Outline**: neither Konva nor the canvas can stroke an image's transparent edge, so the outline
  is a distance field around the opaque pixels, thresholded at the width. The field doesn't depend
  on the width or color, so it's cached per image and size and those sliders stay quick.
- **Blur** is a three-pass box blur (close to a Gaussian) in JS, on a copy small enough that the
  radius there is a few pixels, with edges clamped so a photo's border doesn't fade. It doesn't use
  canvas `filter`, which older Safari lacks, so every browser gets the same pixels.
- **Shadow** uses the canvas's own shadow, which ignores the transform, so `pxPerWorld` converts
  its sizes. The stage's faded copy outside the slides skips it, or it would darken twice.

## Stage and export

- The Konva stage draws each layer twice: a faded, interactive copy (the Transformer target)
  and a full-opacity copy clipped to the slides.
- Export does not read the stage. `renderSlide` redraws each slide from the source image
  pixels, so output is full resolution regardless of the on-screen zoom. Slides export at one
  world pixel per pixel, so a layer stretched more than 1.5× past its image (`layerUpscale`) gets a
  low-resolution note in the toolbar and on the slides it covers. It's derived, never stored. Grid cutting crops
  that canvas. Files go into one ZIP (or a single file), or to the share sheet on phones.
- Animation export pairs each frame with its hold in `playbackSteps` (`encode-gif.ts`) *before*
  reversing, so a hold travels with its own frame, and adds `holdLastMs` to whichever step ends up
  last. Both encoders consume those steps: the GIF writes each step's `delay`, and the video
  passes each duration to `canvasSource.add`, declaring the loop's average as its frame rate.

## Background removal

"Cut out" in the image toolbar has three actions, each one undo step: **Remove background** swaps
the selected photo for a cutout of its subject, **Cut out to new layer** keeps the photo and puts
the cutout exactly on top, and **Portrait** does the same and blurs the photo underneath.

The carousel trims each cutout to its subject (`trim`), so the selection box, snapping and Free
placement use the subject's edges. `cropLayerImage` then shrinks the layer's box to the crop and
shifts it by the crop's offset, turned and mirrored like the layer, so nothing moves on screen.
Fill and fit layers become free, since their 100% size would otherwise be recomputed from the
smaller image. The collage doesn't trim: it draws each cutout over its own photo.
`remove-background.ts` runs BRIA's RMBG-1.4 through Transformers.js:

- Nothing loads until the first use. Then the Transformers.js chunk is imported, the model comes
  from the Hugging Face Hub and the ONNX Runtime wasm from jsDelivr. The browser caches both, so
  later uses (and reloads) don't download again.
- With WebGPU it uses the fp16 model (88 MB, cleanest edges); otherwise, or if the GPU fails, the
  8-bit model on the CPU (44 MB). The CPU path is single-threaded, because GitHub Pages can't send
  the cross-origin isolation headers that threads need.
- The mask is computed on a copy scaled to 1024 px, then stretched over the original pixels, so the
  cutout is a full-resolution transparent PNG (of the same size, unless trimmed). It is registered as a new `imageId`,
  which means autosave, the stage and export need nothing special for it.
- RMBG-1.4 is licensed for **non-commercial use only**. That fits Stitcher being free with no
  paywall; ads or a paid tier would need a licence from BRIA or a different model (`MODEL_ID`).

### Choosing the subject

RMBG cuts out everything prominent as one piece, so two people come out together. **Choose
subject** (`choose-subject.ts`) lets you tap the one you want, with SlimSAM (`Xenova/slimsam-77-uniform`,
Apache-2.0; 21 MB fp16 on WebGPU, 14 MB 8-bit on the CPU) loaded the same lazy way:

- Opening the picker runs SAM's image encoder and RMBG once on the same scaled copy, so their masks
  line up pixel for pixel. Each tap after that only runs SAM's small prompt decoder (about a second
  on the CPU). The stage turns a tap into image pixels through the layer's transform
  (`worldToImage`); Shift-click or a long press adds it as a point to take away.
- SAM returns three masks per prompt, from a small part to the whole object. A tap on a shirt can
  score the printed logo a touch above the person, so the largest mask within 0.1 of the best score
  wins.
- SAM's mask is coarse and blotchy, so it only chooses: its confidence is smoothed and cut low (a
  soft step from 0.1 to 0.2), and RMBG's alpha is kept under it. The edges are RMBG's, as clean as
  Remove background. Where RMBG found almost none of SAM's pick (a subject it didn't treat as
  prominent), SAM's own mask is used, with coarser edges.
- The preview tints the choice and dims the rest. Confirming hands the mask to `cutoutFromMask`,
  the same trim-and-register step Remove background uses, then places it like the other cutouts.

## Faces on slide edges

A face split by a slide edge looks broken when the post is seen one slide at a time.
`detect-faces.ts` finds faces once per image with MediaPipe's BlazeFace (short range), cached by
`imageId`. The editor asks for each new image a moment after the images change (and only with two or
more slides), never during drags.

- BlazeFace sees a 128 px input, which loses the small faces of a group photo, so each image is
  searched whole and in overlapping square tiles of 1/2 and 1/4 of its short side. Hits against an
  inner tile side are dropped (a neighboring tile has the whole face) and overlaps are merged.
- MediaPipe's wasm ships with the app through Vite `?url` imports, so it always matches the package
  (about 3.9 MB gzipped, fetched on first use); the 230 KB model comes from Google's model storage.
- `face-edges.ts` maps the boxes through each layer (`imageBoxToWorld`) and flags any that a slide
  edge (x = k × slideW) cuts more than 12% into. The stage re-maps them live while a layer is
  dragged or transformed, so a mark follows it and clears when the face does.
- **Nudge** tries putting each face side just past each edge and keeps the smallest move that
  splits the fewest faces, as one undo step. A layer that covered an end of the row keeps covering
  it: rather than open a gap, the move pins that end and zooms in just enough.

## State

Carousel editing goes through `commit` in `useEditorHistory`. Rapid edits (sliders, arrow nudges,
drags) pass a `coalesce` key so they form one undo step (1 second window, 80 steps).

The carousel also autosaves. `persist-project.ts` writes the doc to IndexedDB about a second after
edits stop (and on `pagehide`), with each image's blob in a second store, keyed by `imageId`.
On load it reads the doc back, decodes the blobs into the registry, and restores through `reset`,
which replaces the document without adding an undo step. Undo history itself isn't persisted, so
images the current doc no longer uses are pruned on the next save. The GIF tool doesn't autosave
yet; its frames live in component state.

## Conventions

- Lint uses the React Compiler rules: no ref reads during render, no synchronous `setState`
  in effects.
- No backend, accounts or persistence layer (see `.cursorrules`).
- DOM-free logic in `lib/` (carousel, snap-guides, export naming) is kept separable so it can
  move to a shared package if an Expo app happens (see the roadmap).
