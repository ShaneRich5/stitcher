# Stitcher

Stitcher is a free, browser-only image studio for social media creators. Its main tool builds
seamless, swipeable carousels: you lay images across a continuous row of slides and export each
slide as its own image. A second tool turns a sequence of images into a GIF or video, and a third
stacks cut-out subjects into a short video collage.

Everything runs on your device. There's no account, no upload, no watermark and no paywall.

**Live:** https://shanerich5.github.io/stitcher/

---

## Tools

### Carousel (`/`)

- One row of equal-size **slides**. Images live in a shared space, so a single photo can span
  several slides.
- **Split a photo**: pick a slide count (2 to 20) and a format (4:5, 1:1, 3:4, 9:16, 1.91:1); the
  photo is spread evenly across every slide. Changing either afterwards re-fits it.
- **Add images**: drop, paste or pick several. Each lands on its own slide and can be moved anywhere.
- Per-image toolbar: Fill / Fit / Free, zoom, rotate (slider or 90 degrees), flip, aspect lock,
  layer order, duplicate (Ctrl/Cmd+D), replace, delete. Drag, resize and rotate on the canvas;
  arrow keys nudge.
- **Cut out** a photo's subject on your device: remove the background, cut it out to a new layer
  over the untouched photo, or **Portrait** to blur the photo behind a sharp subject. Cutouts are
  trimmed to the subject without moving it.
- **Effects** per image: an outline and a drop shadow that follow a cutout's edge (the sticker
  look), and blur.
- A **low resolution** warning in the toolbar and on the affected slides when a photo is stretched
  more than 1.5× and would export soft.
- **Snapping** to slide edges, centers and grid-cut lines.
- **Background** swatches or a custom color, or transparent.
- **Grid cut**: slice each slide into up to 4 x 4 cells (for profile-grid posts).
- **Swipe preview** shows the slides the way a feed pages through them.
- Undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y).
- **Autosaves** to your browser, so a reload or a closed tab doesn't lose your work. Nothing
  leaves your device.
- **Export** PNG or JPEG as one ZIP, or a single file for one slide. On phones the Save button opens
  the share sheet (Save to Photos).
- Phone layout uses a bottom dock with Carousel and Image tabs.

### GIF (`/gif`)

- **Add frames**: drop, paste or pick several. They play in the order shown in the strip.
- **Frame strip** with thumbnails: drag to reorder, duplicate or remove a frame, click one to
  jump to it.
- **Live preview** with play/pause and frame stepping. Space plays and pauses, arrow keys step,
  Delete removes the frame on screen.
- **Speed** as frame-rate presets (1 to 24 fps) with a precise frame-delay slider under "Style",
  plus an extra hold on the last frame.
- **Timeline view** (the Strip / Timeline switch above the frames): each frame is drawn as wide as
  it is long, with a ruler and a playhead, so you can see the timing rather than read it. Give a
  single frame its own hold, apply that hold to every frame, or reset it to follow the shared
  speed. A frame with its own timing shows its duration in the accent color. The strip stays the
  default; your choice is remembered.
- **Export** as **MP4** (H.264) or **GIF**; WebM, PNG-frame ZIP and JPEG-frame ZIP are under
  "Style → More formats". Output size presets of 1080/720/480, or any size up to 1920.
- Background color, reversed playback and play-once (GIF only).
- Phone layout uses the same bottom dock, with Loop and Export tabs.

### Collage (`/collage`)

- **Add photos**: drop, paste or pick several. Each photo's subject is cut out on your device (the
  background remover downloads once, the first time), with progress in the strip.
- **The video**: each subject appears in turn and stacks on top of the ones before it; a beat later
  that photo fades in behind the stack as the new background.
- **Timing** under "Style": time per photo, how long until the background comes in, fade length
  and a hold at the end.
- **Overlay** color: shown before the first photo, and dims the backgrounds so the subjects stand
  out.
- **Photo strip**: drag to reorder the stack, remove a photo, retry a cutout that failed, or click a
  photo to jump to it.
- **Live preview** with play/pause, a scrubber and photo stepping. Space plays and pauses, arrow
  keys step between photos.
- **Export** as **MP4** (H.264) or WebM at 30 fps, in any of the carousel's formats (9:16 by
  default).
- Phone layout uses the bottom dock, with Timing and Export tabs.

---

## Getting started

Requires Node 22 (the version CI uses).

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production build to dist/
npm run preview   # serve the production build
npm run lint
```

Every push to `main` deploys to GitHub Pages through `.github/workflows/`.

---

## Tech stack

| Concern | Library |
| --- | --- |
| App | Vite 8, React 19 (with React Compiler), TypeScript 6 |
| Routing | TanStack Router (file-based, `src/routes/`) |
| Canvas editing | Konva / react-konva |
| Slice export | Native Canvas API + JSZip |
| GIF encoding | gifenc |
| MP4/WebM encoding | Mediabunny (WebCodecs) |
| Styling | Plain CSS in `src/index.css` |

## Docs

- [Architecture](docs/architecture.md): how the code is organized, the coordinate model and the export pipeline.
- [Roadmap](docs/roadmap.md): the feature gap with SCRL and the planned order of work.
- [`.cursorrules`](.cursorrules): project conventions (client-only, kebab-case filenames, etc.).
