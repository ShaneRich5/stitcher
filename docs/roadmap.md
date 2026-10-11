# Roadmap: SCRL parity, without the friction

[SCRL](https://scrl.com/) is the reference app for seamless carousels. What it does well:

- a continuous, horizontally scrolling canvas where content spans slides
- up to 20 slides in one post
- collage/grid templates
- text, stickers and frames
- video inside the grid
- smart snapping and a layer panel
- preview, then share straight to social media

What users complain about:

- most templates, gradient backgrounds and video-in-grid features are paywalled (weekly
  subscription, with a free tier that "feels like a demo")
- it's centered on Instagram, with weak Story/TikTok/Pinterest support
- templates make everyone's posts look the same
- it's mobile-only

**Stitcher's position:** match SCRL's core editing power, but keep it free, with no account and no
watermark, running in any browser, and with every platform as a first-class preset.

Open work is tracked as [GitHub issues](https://github.com/ShaneRich5/stitcher/issues). Items
below link to their issue once one exists.

## Current status

| Capability | SCRL | Stitcher |
| --- | --- | --- |
| Continuous canvas, content spans slides | ✅ | ✅ |
| Split one photo across slides | ✅ | ✅ (2–20) |
| Max slides | 20 | 20 |
| Snapping guides | ✅ | ✅ (while dragging) |
| Undo/redo | ✅ | ✅ |
| Layer reorder | drag & drop | forward / back buttons |
| Rotate and flip layers | ✅ | ✅ |
| Crop / mask image inside a frame | ✅ | ❌ |
| Text layers + fonts | ✅ | ❌ |
| Stickers / shapes | ✅ | ❌ |
| Background color / gradient | ✅ (gradients are Premium) | Solid color or transparent; no gradients |
| Collage grid templates | ✅ (mostly Premium) | ❌ |
| Borders, spacing, corner radius | ✅ | ❌ |
| Filters / adjustments | ✅ | Blur only |
| Video in carousel | ✅ (Premium) | ❌ (GIF tool only) |
| Swipe preview | ✅ | ✅ |
| Share to social | ✅ | Share sheet on phones (Save to Photos); ZIP download on desktop |
| Save / reopen projects | ✅ | ✅ (autosaved locally; no explicit save/open UI yet) |
| Platform presets | IG-centric | 5 formats: 4:5, 1:1, 3:4, 9:16, 1.91:1 |
| GIF / MP4 from frames | ❌ | ✅ |
| Profile-grid slicing | partial | ✅ (up to 4 × 4 per slide) |
| Free, no account, no watermark | ❌ | ✅ |

## Phase 0: stabilize (before adding features)

Done with the split-first rebuild:

- [x] Lint errors fixed.
- [x] Undo coalescing for arrow nudges, sliders and drags (`coalesce` keys in `useEditorHistory`).
- [x] `downloadBlob` moved into `src/lib/download.ts`.
- [x] Tile bugs retired: slides are now uniform, so per-tile widths and "Export this tile" no
  longer exist. Resizing no longer snaps, which removes the "snap moves the box" bug.

Done:

- [x] Carousel work now survives a reload. The carousel autosaves to IndexedDB (doc JSON in one
  store, image blobs in another, pruned as layers are deleted) and restores on load, bypassing
  undo history. ([#1](https://github.com/ShaneRich5/stitcher/issues/1))
- [x] `Layer` now stores `imageId` + `naturalWidth`/`naturalHeight` instead of an
  `HTMLImageElement`, with a small in-memory registry (`lib/image-registry.ts`) mapping image ID
  to the decoded image. `CarouselDoc` is plain JSON now, and `carousel.ts` / `render-slide.ts` stay
  DOM-free except for that one lookup. Done as groundwork for #1; the same change was needed for
  the Phase 4 Expo port. ([#12](https://github.com/ShaneRich5/stitcher/issues/12))

- [x] The GIF tool was rebuilt on the carousel's shell (nav actions, control bar, centred stage,
  thumbnail strip, phone dock), with frame thumbnails and drag-to-reorder, drag-and-drop and
  paste, play/pause and frame stepping, and frame-rate presets. It now shares the carousel's
  image loader and registry, which removed its duplicate loader and the lint warning in #2.
  The old pre-rebuild styles it was the last user of were deleted (`index.css` 616 → 232 lines).
- [x] ~~Fix the ref cleanup lint warning in `gif-maker.tsx`~~ — gone with that rewrite.
  `npm run lint` is now clean. ([#2](https://github.com/ShaneRich5/stitcher/issues/2))
- [x] **Per-frame timing**, behind a Strip / Timeline switch above the frames. The timeline draws
  each frame as wide as it holds, with a ruler and a playhead, and a frame can take its own hold
  (`GifFrame.holdMs`) instead of the shared speed. Both encoders already computed a per-frame
  duration, so this threaded through as `frameDelaysMs`. The strip stays the default and the
  choice is remembered in `localStorage`. Design directions compared first on a
  [mockup canvas](https://claude.ai/artifact/HnCXt4uu7hudouewqa1EFN).

Open:

- [ ] Autosave doesn't cover the GIF tool yet — its frames are still lost on reload or switching
  tools. Same pattern as #1, scoped to `GifDoc`.
- [ ] Bring `.cursorrules` in line with the current architecture. ([#3](https://github.com/ShaneRich5/stitcher/issues/3))
- [ ] Vitest unit tests for the carousel maths, snapping and undo history. ([#4](https://github.com/ShaneRich5/stitcher/issues/4))
- [ ] Merge the duplicated `fitContain` / `drawFrame` helpers in the encoders. ([#13](https://github.com/ShaneRich5/stitcher/issues/13))

## Phase 1: core editor parity (makes a free SCRL substitute)

1. **Background**: solid color and transparent are done. Gradients are still to do, and are free
   here where SCRL paywalls them.
2. **Text layers**: Konva `Text` with Google Fonts, size, color, alignment, line height, stroke and
   shadow. Needs a `type` discriminator on `Layer`.
3. ~~**Rotation and flip**~~: done, including export.
4. **Crop / mask**: double-click an image to pan and zoom it inside its own bounds (SCRL "frames").
5. **Better layer panel**: thumbnails, drag-and-drop reorder, hide and lock. Duplicate is done
   ([#17](https://github.com/ShaneRich5/stitcher/issues/17)).
6. **Slide management**: up to 20 slides and add/remove from the slide strip are done. Still to
   do: insert a slide between two others, and duplicate a slide.
7. **Faster input**: drag and drop and clipboard paste are done. Still to do:
   - canvas zoom and pan, with a "Fit" button ([#8](https://github.com/ShaneRich5/stitcher/issues/8))
   - selecting layers from the keyboard ([#9](https://github.com/ShaneRich5/stitcher/issues/9))
   - HEIC photos and files with no MIME type ([#5](https://github.com/ShaneRich5/stitcher/issues/5))
8. **Previews**: the swipe preview is done. Next is an Instagram profile-grid crop overlay, since
   the grid shows a 3:4 crop of the first slide ([#10](https://github.com/ShaneRich5/stitcher/issues/10)).
9. **More presets**: 9:16 (TikTok photo mode, Stories) is done. Add Pinterest 2:3 and X/YouTube
   16:9 ([#7](https://github.com/ShaneRich5/stitcher/issues/7)). LinkedIn carousels are PDF
   documents, so they need a PDF export rather than a preset.
10. **Export options**: JPEG export, the Web Share API on phones, and a warning when a stretched
    photo would export soft ([#18](https://github.com/ShaneRich5/stitcher/issues/18)) are done. Add a
    JPEG quality slider ([#6](https://github.com/ShaneRich5/stitcher/issues/6)).

## Phase 2: collage and style

- Grid/collage **layouts** as tiles with image slots (2-up, 3-up, mosaic), with adjustable
  **spacing, border and corner radius**.
- **Stickers and shapes**: emoji, basic shapes, lines and arrows, plus uploaded PNG stickers.
- **Filters and adjustments** per image: blur is done, and Portrait uses it
  ([#21](https://github.com/ShaneRich5/stitcher/issues/21)). Still to do: brightness, contrast,
  saturation and warmth, drawn through `drawLayerContent` like the blur so the export matches.
- **Drop shadows** and outlines: done for images
  ([#16](https://github.com/ShaneRich5/stitcher/issues/16)); text still to do.
- **Templates**: a small built-in set stored as JSON, free and remixable. Keep them varied to avoid
  SCRL's "every post looks the same" problem.

## Phase 3: motion and persistence

- **Send carousel slides to the GIF tool** as frames, for a quick animated version
  ([#11](https://github.com/ShaneRich5/stitcher/issues/11)). This is the cheap first step toward the
  panorama video below.
- **Video layers** in carousel tiles, exported per slide as MP4 using the Mediabunny pipeline that
  already exists.
- A **panorama scroll video** that pans across the whole carousel as one Reel. This is a strong
  differentiator and can reuse `encode-video.ts`.
- ~~**Save and reopen projects** locally (IndexedDB, with images stored as blobs)~~: done via
  autosave ([#1](https://github.com/ShaneRich5/stitcher/issues/1)). Still to do: export/import a
  `.stitcher` file, for backing up or moving a project between devices, and the same autosave for
  the GIF tool's frames.
  *Note: `.cursorrules` currently says "no persistence layer", which this autosave already
  crosses; that rule needs updating ([#3](https://github.com/ShaneRich5/stitcher/issues/3)).*
- A **PWA** so the app installs and works offline, which covers SCRL's mobile-app use case.

## Phase 4: native app (Expo)

A native iOS/Android app would put Stitcher where SCRL's users already are. It would also unlock
things the web version can't do well: saving straight to the camera roll, the native share sheet
into Instagram, and picking photos from the full library.

**What carries over and what doesn't:**

| Layer | Web today | Expo equivalent |
| --- | --- | --- |
| Geometry (slides, snapping, split, grid, crop maths) | `src/lib/*` | **Reusable as is** if kept DOM-free |
| Canvas + gestures | Konva / react-konva (DOM only) | `@shopify/react-native-skia` + `react-native-gesture-handler` + Reanimated |
| Slide export | Canvas `drawImage` + `toBlob` | Skia offscreen surface → `makeImageSnapshot()` → PNG/JPEG |
| ZIP | JSZip | JSZip (pure JS), though mobile usually wants a camera-roll save instead |
| GIF | gifenc | gifenc (pure JS, fed by Skia `readPixels`) |
| MP4/WebM | Mediabunny (needs WebCodecs) | Needs a native encoder module, since WebCodecs isn't available |
| Routing | TanStack Router | Expo Router |
| Photos in / out | `<input type=file>`, downloads | `expo-image-picker`, `expo-media-library`, `expo-sharing` |

**Groundwork to do now so the port stays cheap:**

- Keep `src/lib` **free of DOM and React**. `render-slide.ts`, `export-carousel.ts` and
  `load-image.ts` touch `HTMLImageElement` and `document.createElement('canvas')`; put those behind
  a small rendering interface. Leave the pure maths (`carousel.ts`, `snapBox`) in plain functions.
- Change `Layer` to store `{ imageId, naturalWidth, naturalHeight }` instead of an
  `HTMLImageElement` ([#12](https://github.com/ShaneRich5/stitcher/issues/12)). Each platform keeps
  its own map from image ID to decoded image.
- Settle on a serializable project format (JSON + image blobs) early. The same format then serves
  Phase 3 saving and a future web↔mobile handoff.
- When the port starts, move to a monorepo: `packages/core` (pure TS), `apps/web` (Vite),
  `apps/mobile` (Expo).

**Suggested timing:** after Phase 1. By then the editor model (text, rotation, crop, backgrounds)
will have settled, so the native renderer is written once against a stable model rather than
chasing changes. Expo for web (Skia via CanvasKit) could replace the Vite app later, but CanvasKit
is a multi-MB WASM download, so keep the lightweight web build until mobile is proven.

## Explicitly out of scope

Accounts, cloud sync, a backend, paywalls or watermarks, and direct posting through platform APIs
(that would need a server and OAuth).
