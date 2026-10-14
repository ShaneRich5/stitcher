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
    index.tsx                 /     -> LandingPage
    carousel.tsx              /carousel -> StitcherEditor
    gif.tsx                   /gif  -> GifMaker
    collage.tsx               /collage -> CollageMaker
  components/
    root-layout.tsx           App shell; each tool renders its own <AppNav> with its actions
    update-banner.tsx         Offers a reload once a newer deploy has replaced this page's build
    landing-page.tsx          Landing page: hero, panorama split into slides, links to the tools
    stitcher-editor.tsx       Carousel tool: state, handlers, keyboard, drag/drop, paste, export
    carousel-stage.tsx        Konva stage: slides, layers, snapping, transformer, zoom and pan
    carousel-controls.tsx     Whole-carousel controls (slides, format, split, style, export type)
    image-controls.tsx        Selected-image controls (compact or detailed bar under the canvas / phone sheet), layer picker
    slide-strip.tsx           Thumbnails of the slides as posted
    swipe-preview.tsx         Feed-style swipe preview dialog
    icons.tsx, app-nav.tsx    Shared UI
    inspector-sections.tsx    Studio inspector shell for GIF and collage: sections on desktop, tabs on phones
    gif-maker.tsx             GIF tool: state, playback, keyboard, drag/drop, paste, export; Quick or Studio
    gif-quick.tsx             Quick: chips, the player with its neighbours, frame pill, Speed panel, frame toolbar
    gif-inspector.tsx         Studio inspector: this frame's hold, playback, output, checks
    gif-screen.tsx            One frame letterboxed into the output size, drawn by drawFrame like the export
    frame-strip.tsx           Frame thumbnails; drag to reorder (Studio's strip view, and on phones)
    frame-timeline.tsx        Studio's timeline: frames sized by hold, ruler, playhead, drag an edge to hold
    collage-maker.tsx         Collage tool: cutout queue, playback, keyboard, drag/drop, paste, export; Quick or Studio
    collage-quick.tsx         Quick: chips, player, photo card, Pace panel, photo toolbar
    collage-photos.tsx        Photo rows with cutout status and retry; drag to reorder
    collage-sequence.tsx      Studio's sequence: a lane per photo (subject in, photo behind, covered)
    collage-inspector.tsx     Studio inspector: timing, motion, overlay, cutout, checks; video fields
    tool-welcome.tsx          The empty GIF and Collage tools: a landing page, with a way back to the example
    quick-guide.tsx           A short tour over the example: a card beside each [data-guide] target
  lib/
    carousel.ts               Doc helpers: makeLayer, zoom, relayout, slide add/remove
    gif-doc.ts                GifDoc helpers: frame add/remove/reorder, fps <-> delay, speed presets,
                              output size and the bars / soft frame checks
    handoff.ts                Frames passed between tools in memory (carousel slides -> GIF tool)
    app-update.ts             Notices a replaced build (a lazy load 404s, or the live page names a newer one)
    samples.ts                The GIF and Collage first-visit samples, drawn from assets/samples/*.svg
    first-use.ts              Whether this browser has been through a tool's example
    collage.ts                CollageDoc helpers, styles (the Instagram loop, or stacks whose photos fade
                              out or stay), timing, pace presets, the sequence schedule, and
                              drawCollageFrame (preview + export)
    use-element-size.ts, use-stored-mode.ts  A measured element's size; Quick / Studio remembered per tool
    image-registry.ts         imageId -> decoded image, object URL and source blob
    crop-image.ts             Register part of an image as a new one (Fill this slide)
    idb.ts, persist-project.ts  IndexedDB autosave of the carousel
    snap-guides.ts            Snap targets, snapBox() for drags and snapResize() for resize handles
    render-slide.ts           Canvas render of one slide from source pixels
    remove-background.ts      Subject cutouts with RMBG-1.4 via Transformers.js, loaded on first use
    choose-subject.ts         Tap to choose the subject: SlimSAM picks which part of RMBG's mask to keep
    detect-faces.ts           Face boxes per image with MediaPipe's BlazeFace, loaded on first use
    face-edges.ts             Faces a slide edge splits, and the Nudge that clears them (DOM-free)
    layer-effects.ts          Outline, shadow, blur, look and date stamp, drawn the same on the stage and in export
    film-looks.ts             Film presets and adjustments; gradePixels grades RGBA pixels (DOM-free)
    light-leaks.ts            Seeded leaks on the seams between slides, drawn over every layer
    date-stamp.ts             EXIF date reader and the seven-segment date stamp
    load-image.ts             File intake: image-type checks, HEIC conversion, skipped-file messages
    export-carousel.ts        Slide/grid files, ZIP, Web Share
    use-editor-history.ts     Immutable undo/redo with coalescing
    use-slide-thumbnails.ts   Debounced thumbnails
    encode-gif.ts, encode-video.ts   GIF and MP4/WebM encoders (frame lists, or drawn timelines)
    draw-frame.ts             fitContain and drawFrame, shared by every encoder
    *.test.ts                 Vitest unit tests for the pure logic (npm test)
  types.ts                    Layer, CarouselDoc, FitMode, GifFrame, CollageItem
e2e/                          Playwright tests of the built app (npm run test:e2e)
```

All three tools share one shell: `AppNav` actions, a `.split-bar` of controls, a `.workspace`, a
thumbnail strip, and a phone `.dock` with tabs. The styles live in `editor.css`.

## Data model

```ts
CarouselDoc { slideW, slideH, count, gridCols, gridRows, background: string | null, layers, lightLeaks? }
Layer { id, name, imageId, naturalWidth, naturalHeight,
        x, y, width, height, rotation, flipX, fit, lockAspect,
        outline?, shadow?, blur?, look?, dateStamp? }

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
- **Instagram style** (`style: 'instagram'`, the default) shows one photo at a time. Each photo gets
  a turn of `max(stepMs, backgroundDelayMs + fadeMs)`: on screen alone, then the next photo arrives
  over it, its subject fading in first and its photo `backgroundDelayMs` later, covering the old
  one. Once the photo is in, its subject isn't drawn on top, being in the photo already. After the
  last photo the first arrives the same way, and the video ends as it's back in full, so the end
  meets the start and it loops (`instagramFrame` says what any moment shows). There's no end hold,
  overlay or parallax.
- **Stack style:** item `i`'s subject starts at `i × stepMs` and fades in over `fadeMs`; its photo
  starts fading in `backgroundDelayMs` later. Earlier subjects stay, so they stack. With
  `backgrounds: 'fade'` each photo fades back out as the next subject arrives; with `'stay'` it
  stays until covered. The video ends `holdEndMs` after the last background is in
  (`collageDurationMs`).
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
- **Look** is a film preset (scaled by its strength) plus brightness, contrast, saturation, warmth,
  grain and vignette, all in one `LayerLook`. `gradePixels` in `film-looks.ts` applies it in one
  pass: per-channel tone curves (white balance, exposure, contrast, faded blacks) from 256-entry
  tables, then saturation, a tint for the shadows and another for the highlights, the vignette and
  the grain. It's graded after the blur, so the grain stays sharp on a portrait's background.
  The graded copy is as large as it's drawn, in √2 steps so a resize rarely regrades it, and no
  larger than the photo unless it has grain: grain is 1.5 world pixels, so it looks the same on
  every slide, and on a stretched photo that needs more pixels than the photo has. The vignette is
  relative to the photo. Copies are cached under a pixel budget rather than a count, since "Apply
  to all photos" can give every layer one, and evicted canvases are emptied so Safari frees them.
  A cutout keeps its photo's look, so the subject matches what's behind it.
- **Date stamp** is the orange date of a point-and-shoot print. Turning it on reads
  `DateTimeOriginal` from the photo's EXIF (`exifDate`, a small APP1/TIFF parser over the first
  256 KB of the source blob), then the file's last-modified date, then today, and stores the date
  (`YYYY-MM-DD`) and a format on the layer, so the doc stays plain data. The digits are
  seven-segment paths with a canvas-shadow glow, so no font downloads. They sit at the bottom right
  of the part of the photo that's over the slides (`stampArea`), since a Fill photo usually runs
  past the bottom of the row, and a flipped layer is mirrored back so they still read forwards.
  A cutout placed as a new layer leaves the stamp with the photo.

### Light leaks

`CarouselDoc.lightLeaks` (`amount`, `color`, `seed`) adds leaks across the whole carousel rather
than per photo: on a roll of film a leak bleeds across neighbouring frames, and slides are
neighbours too. `leakSpots` places them from the seed, on about seven seams in ten and always at
least one: each a large soft glow and often a smaller, redder one, every one crossing its seam.
Each seam has its own generator, so adding a slide doesn't move the leaks on the others, and
Shuffle picks a new seed. `drawLightLeaks` paints them in world space with a `screen` blend after
the layers, in `renderSlide` (thumbnails, preview, export) and as a non-listening `Shape` on the
stage, so exported slides placed side by side carry each leak across the seam.

## Stage and export

- The Konva stage draws each layer twice: a faded, interactive copy (the Transformer target)
  and a full-opacity copy clipped to the slides.
- **Zoom and pan.** By default the stage fits the row, or scrolls sideways once slides would drop
  below 150 px. Ctrl/Cmd + wheel (and a trackpad pinch, which arrives as one), a two-finger pinch on
  touch, or the zoom bar switch it to a view of its own: a stage the size of the workspace with a
  scale (up to 400%) and an offset, so a long carousel at 400% never needs a huge canvas. The plain
  wheel, Space + drag and a drag on empty canvas then pan, and **Fit** returns to the automatic
  layout. The snap threshold (`8 / scale`) and stroke widths already follow the scale.
- **Keyboard.** The canvas is focusable: Tab and Shift+Tab step through the layers in stacking
  order (focus moves on past either end, keeping the selection), a polite live region names the
  selected layer, and Enter jumps to its toolbar. Arrow keys nudge and Delete removes, as before.
- **Profile grid.** Instagram's profile grid shows a centred 3:4 crop of the first slide
  (`profileGridCrop`). The zoom bar's toggle shades what that crop cuts from slide 1, for formats
  that aren't already 3:4, and the swipe preview shows the cover as it will look on the profile.
  Export is unchanged.
- Export does not read the stage. `renderSlide` redraws each slide from the source image
  pixels, so output is full resolution regardless of the on-screen zoom. Slides export at one
  world pixel per pixel, so a layer stretched more than 1.5× past its image (`layerUpscale`) gets a
  low-resolution note in the toolbar and on the slides it covers. It's derived, never stored. Grid cutting crops
  that canvas. Files go into one ZIP (or a single file), or to the share sheet on phones. JPEG
  quality (60–100, default 92) is an export setting kept beside the format, not in the doc.
- **Make a GIF or video** renders each slide with `renderSlide`, registers it as an image, and hands
  the frames to the GIF tool through `handoff.ts` (in memory, not the URL) before navigating there.
  The GIF tool reads them in its initial state and clears the handoff once mounted.
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

## Opening files

Drops, pastes and file pickers all go through `listFiles`, which filters nothing, and
`loadImageFiles`, which says why each file it skipped was skipped, so none disappear silently. A
file counts as an image by its MIME type or, when the type is empty (Windows, some drag sources),
by its extension. HEIC decodes natively only in Safari; elsewhere it's converted to JPEG with
heic2any, imported on first use (about 1.3 MB), and kept as a `File` with the original's date for
the date stamp. If that fails, the message suggests exporting as JPEG or opening Stitcher in Safari.

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
- No backend, accounts or server-side persistence (see `.cursorrules`); the local IndexedDB
  autosave is fine.
- `npm test` runs Vitest over the pure logic in `lib/`; the deploy workflow runs it before building.
- `npm run test:e2e` builds the app, serves it under `/stitcher/` and drives it in Chromium with
  Playwright. Canvas checks read the stage's pixels: a solid-color photo on white slides tells the
  exported copy (full color) from the faded one you grab. Pull requests run both suites.
- DOM-free logic in `lib/` (carousel, snap-guides, export naming) is kept separable so it can
  move to a shared package if an Expo app happens (see the roadmap).
