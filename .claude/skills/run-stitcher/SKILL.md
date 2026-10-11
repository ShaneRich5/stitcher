---
name: run-stitcher
description: Launch the Stitcher app (production build under vite preview) and drive it in headless Chrome with Playwright, to see a change working in the real app. Includes ready scripts for the carousel's face-on-edge Nudge, Choose subject cutouts, and the collage's parallax and MP4 export, plus helpers for clicking on the Konva stage and setting React range inputs.
---

# Run and drive Stitcher

Stitcher is a static Vite + React app with no backend. "Running" it means serving the build and
driving it in a real browser: the stages are Konva canvases, and the cutout, subject and face
features run models in the page. This was set up and verified on Windows (Git Bash) with Chrome
installed; the commands for macOS/Linux are noted where they differ.

## 1. Build and serve

Serve the **production build**, not the dev server: it matches GitHub Pages (base `/stitcher/`,
MediaPipe's wasm emitted as build assets).

```bash
npm run build
# Run in the background (run_in_background). MSYS_NO_PATHCONV stops Git Bash rewriting
# "/stitcher/" into a Windows path; it's harmless elsewhere.
MSYS_NO_PATHCONV=1 npx vite preview --port 4173 --strictPort --base /stitcher/
```

Wait for it rather than sleeping:

```bash
timeout 30 bash -c 'until curl -sf http://localhost:4173/stitcher/ >/dev/null; do sleep 1; done'
```

`--base /stitcher/` is required: `vite.config.ts` only sets that base for `build`, so a bare
`vite preview` serves at `/` while the HTML asks for `/stitcher/assets/…`, and the page is blank.
Rebuild after every source change; preview serves `dist/` as it is.

Stop it by killing the port's listener (not the npm wrapper):

```bash
# Windows (Git Bash)
for pid in $(netstat -ano | grep ":4173 " | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID $pid //F; done
# macOS / Linux
lsof -ti:4173 -sTCP:LISTEN | xargs -r kill
```

For a quick look without building, `npm run dev` serves at `http://localhost:5173/`; point the
scripts at it with `STITCHER_URL=http://localhost:5173/`.

## 2. Set up the driver (once per session)

The scripts live in `driver/` next to this file. Copy them to a scratch folder and install there,
so nothing is added to the project:

```bash
D="<scratchpad>/stitcher-driver"
mkdir -p "$D" && cp -r .claude/skills/run-stitcher/driver/. "$D"/ && (cd "$D" && npm install --no-audit --no-fund)
```

They use Playwright's `chrome` channel (the installed Google Chrome); set `CHROME_PATH` to use
another Chromium. Keep `$D` between runs: its `profile/` caches the model downloads, and
`photos/` the sample photos (fetched on first use from the Transformers.js docs dataset).

## 3. Drive it

```bash
node "$D/faces.mjs"     # carousel: face on a slide edge is marked, Nudge clears it, undo restores
node "$D/choose.mjs"    # carousel: Choose subject on two touching players vs plain Remove background
node "$D/collage.mjs"   # collage: frames with parallax on/off, then the MP4 export
```

Each prints timings and screenshot paths (in `$D/shots/`), and exits non-zero on a failed step or
a console error. **Look at the screenshots**; a pass only means nothing threw. `choose.mjs` and
`collage.mjs` download models on first run (RMBG ~44 MB, SlimSAM ~14 MB), so start them in the
background. Cached, each takes under a minute.

To check new behavior, copy the closest script. `common.mjs` has what they share:

- `run(path, async (page) => …)` opens the app with the autosave cleared, runs the steps,
  screenshots on failure, and reports console errors.
- `photo(name)`, `shot(page, name, opts)`, `setRange(page, selector, value)`.
- `worldToPage(page, wx, wy)` turns carousel world pixels into a click position on the stage, and
  `footballToWorld(x, y)` maps football-match.jpg's pixels when it's split across the default 3 slides.

## Gotchas

- A new carousel opens as 3 slides of 1080 × 1350. Adding one photo first fills the row; adding
  more places each on its own slide.
- Range inputs are React-controlled: `fill` doesn't work on them, so use `setRange`.
- The collage autoplays once its cutouts finish; press Space to pause before scrubbing.
- Headless Chrome has no WebGPU adapter, so the models take the CPU (wasm) path. The WebGPU path
  and touch long-press can't be checked here.
- Expected console noise, already filtered: MediaPipe logs an `INFO:` line through
  `console.error`, and Transformers.js gets a 404 probing for RMBG's `tokenizer_config.json`.
- To check that the export matches the preview, pull the same moment out of the MP4 with ffmpeg
  (frame n at 30 fps is n / 30 s) and compare it with the canvas frame.
