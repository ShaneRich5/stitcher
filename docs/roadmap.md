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

## Current status

| Capability | SCRL | Stitcher |
| --- | --- | --- |
| Continuous canvas, content spans slides | ✅ | ✅ |
| Split one photo across slides | ✅ | ✅ (2–10) |
| Max slides | 20 | 10 via split; unlimited via "Add tile" |
| Snapping guides | ✅ | ✅ |
| Undo/redo | ✅ | ✅ |
| Layer reorder | drag & drop | ◀ ▶ buttons |
| Rotate layers | ✅ | ❌ (`rotateEnabled={false}`) |
| Crop / mask image inside a frame | ✅ | ❌ |
| Text layers + fonts | ✅ | ❌ |
| Stickers / shapes | ✅ | ❌ |
| Background color / gradient | ✅ (gradients are Premium) | ❌ (always white) |
| Collage grid templates | ✅ (mostly Premium) | ❌ |
| Borders, spacing, corner radius | ✅ | ❌ |
| Filters / adjustments | ✅ | ❌ |
| Video in carousel | ✅ (Premium) | ❌ (GIF tool only) |
| Swipe preview | ✅ | ❌ |
| Share to social | ✅ | ❌ (download only) |
| Save / reopen projects | ✅ | ❌ |
| Platform presets | IG-centric | IG only (4 presets) |
| GIF / MP4 from frames | ❌ | ✅ |
| Profile-grid slicing (cell size) | partial | ✅ |
| Free, no account, no watermark | ❌ | ✅ |

## Phase 0: stabilize (before adding features)

- [ ] **Fix lint** (7 errors). `npm run lint` currently fails:
  - `stitcher-editor.tsx:85`: `stateRef.current = …` is assigned during render. Move it into
    `useLayoutEffect`, or keep the snapshot in a reducer.
  - `stitcher-editor.tsx:669–681`: `dim()` closures are flagged for reading refs. Turn `dim` into a
    small `<DimField>` component.
  - `gif-maker.tsx:134`: setState is called synchronously in an effect. Clamp `previewIndex` when
    frames are removed instead.
  - `routes/__root.tsx`: add `allowExportNames: ['Route']` to `react-refresh/only-export-components`.
- [ ] **Bug: resizing a tile's width doesn't shift the layers to its right.** Layers use world
  coordinates, so changing the width of tile N moves the frames of tiles N+1… under their content.
  Shift layers by the width change, the same way `removeTile` does.
- [ ] **Bug: snapping after a resize moves the box.** `onTransformEnd` calls `snapNode`, which
  translates the whole box instead of adjusting the edge being dragged.
- [ ] **History flooding**: each keystroke in the tile name and each arrow-key nudge becomes its
  own undo step. Coalesce them (debounce, or commit on blur or key-up).
- [ ] "Export this tile" triggers several downloads in a row, and browsers often block that. Zip it,
  or send one file per tile when the tile has a single cell.
- [ ] Merge duplicated helpers (`downloadBlob`, `fitContain`, `drawFrame`) into `src/lib`.
- [ ] Add Vitest unit tests for the pure maths: `snapBox`, `rasterWorldLayersToTileCanvas`
  crop maths, `gridCounts` and `tileOriginX`.
- [ ] Keep `src/lib` DOM-free where possible. This is groundwork for the Expo app in Phase 4.

## Phase 1: core editor parity (makes a free SCRL substitute)

1. **Background**: a solid color or gradient per project, and a transparent PNG option. This is
   free here, where SCRL paywalls gradients.
2. **Text layers**: Konva `Text` with Google Fonts, size, color, alignment, line height, stroke and
   shadow. Needs a `type` discriminator on `Layer`.
3. **Rotation and flip**: enable the Transformer's rotate handle and include rotation in the export
   raster step (switch that step to drawing with `ctx.rotate`, or rasterize the Konva stage at
   `pixelRatio` for each tile).
4. **Crop / mask**: double-click an image to pan and zoom it inside its own bounds (SCRL "frames").
5. **Better layer panel**: thumbnails, drag-and-drop reorder, duplicate, hide and lock.
6. **Tile management**: reorder tiles, insert a tile between two others, duplicate a tile, and
   raise split to 20.
7. **Faster input**: drag and drop files onto the canvas, paste from the clipboard, pinch or wheel
   to zoom, space-drag to pan, and a "fit all" button.
8. **Swipe preview**: a phone mockup that shows slides one at a time with swipe/arrow navigation.
9. **More presets**: TikTok photo mode (1080×1920), LinkedIn doc (1080×1350), Pinterest
   (1000×1500), X (1600×900) and Threads, grouped by platform.
10. **Export options**: JPEG with a quality slider (Instagram re-compresses PNG anyway), plus the
    Web Share API on mobile for "share to Instagram".

## Phase 2: collage and style

- Grid/collage **layouts** as tiles with image slots (2-up, 3-up, mosaic), with adjustable
  **spacing, border and corner radius**.
- **Stickers and shapes**: emoji, basic shapes, lines and arrows, plus uploaded PNG stickers.
- **Filters and adjustments** per image: brightness, contrast, saturation and warmth (Konva
  filters, applied again at export).
- **Drop shadows** and outlines on images and text.
- **Templates**: a small built-in set stored as JSON, free and remixable. Keep them varied to avoid
  SCRL's "every post looks the same" problem.

## Phase 3: motion and persistence

- **Video layers** in carousel tiles, exported per slide as MP4 using the Mediabunny pipeline that
  already exists.
- A **panorama scroll video** that pans across the whole carousel as one Reel. This is a strong
  differentiator and can reuse `encode-video.ts`.
- **Save and reopen projects** locally (IndexedDB, with images stored as blobs) and export/import a
  `.stitcher` file. *Note: `.cursorrules` currently says "no persistence layer". Local-only storage
  keeps the no-backend principle, but that rule needs updating first.*
- A **PWA** so the app installs and works offline, which covers SCRL's mobile-app use case.

## Phase 4: native app (Expo)

A native iOS/Android app would put Stitcher where SCRL's users already are. It would also unlock
things the web version can't do well: saving straight to the camera roll, the native share sheet
into Instagram, and picking photos from the full library.

**What carries over and what doesn't:**

| Layer | Web today | Expo equivalent |
| --- | --- | --- |
| Geometry (tiles, snapping, split, grid, crop maths) | `src/lib/*` | **Reusable as is** if kept DOM-free |
| Canvas + gestures | Konva / react-konva (DOM only) | `@shopify/react-native-skia` + `react-native-gesture-handler` + Reanimated |
| Slice export | Canvas `drawImage` + `toBlob` | Skia offscreen surface → `makeImageSnapshot()` → PNG/JPEG |
| ZIP | JSZip | JSZip (pure JS), though mobile usually wants a camera-roll save instead |
| GIF | gifenc | gifenc (pure JS, fed by Skia `readPixels`) |
| MP4/WebM | Mediabunny (needs WebCodecs) | Needs a native encoder module, since WebCodecs isn't available |
| Routing | TanStack Router | Expo Router |
| Photos in / out | `<input type=file>`, downloads | `expo-image-picker`, `expo-media-library`, `expo-sharing` |

**Groundwork to do now so the port stays cheap:**

- Keep `src/lib` **free of DOM and React**. Move the parts that touch `HTMLImageElement` and
  `document.createElement('canvas')` behind a small rendering interface. Leave the pure maths
  (`rasterWorldLayersToTileCanvas`'s source-rect calculation, `snapBox`, `gridCounts`) in plain
  functions.
- Change `Layer` to store `{ imageId, naturalWidth, naturalHeight }` instead of an
  `HTMLImageElement`. Each platform keeps its own map from image ID to decoded image.
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
