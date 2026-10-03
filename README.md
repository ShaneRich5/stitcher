# Stitcher

Stitcher is a free, browser-only image studio for social media creators. Its main tool builds
seamless, swipeable carousels: you lay images across a continuous row of slides and export each
slide as its own image. A second tool turns a sequence of images into a GIF or video.

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
  layer order, replace, delete. Drag, resize and rotate on the canvas; arrow keys nudge.
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
- **Export** as **MP4** (H.264) or **GIF**; WebM, PNG-frame ZIP and JPEG-frame ZIP are under
  "Style → More formats". Output size presets of 1080/720/480, or any size up to 1920.
- Background color, reversed playback and play-once (GIF only).
- Phone layout uses the same bottom dock, with Loop and Export tabs.

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
