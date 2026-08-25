import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { MultiTileComposer } from './multi-tile-composer'
import { gridCounts } from '../lib/export-tiles'
import { tileIdForLayer } from '../lib/raster-world-tile'
import { tileOriginX } from '../lib/tile-layout'
import {
  buildAllTilesExportZip,
  downloadTileSlicesAsSeparatePngs,
} from '../lib/tile-export-zip'
import type { Layer, ProjectTile } from '../types'

function makeInitialTiles(): { tiles: ProjectTile[]; activeId: string } {
  const id = crypto.randomUUID()
  return {
    activeId: id,
    tiles: [
      {
        id,
        label: 'Tile 1',
        frameW: 1080,
        frameH: 1350,
        sliceW: 1080,
        sliceH: 1350,
      },
    ],
  }
}

function fitImageToFrame(
  img: HTMLImageElement,
  frameW: number,
  frameH: number,
): { width: number; height: number; x: number; y: number } {
  const nw = img.naturalWidth || img.width
  const nh = img.naturalHeight || img.height
  const maxW = frameW * 0.92
  const maxH = frameH * 0.92
  const r = Math.min(maxW / nw, maxH / nh, 1)
  const width = Math.round(nw * r)
  const height = Math.round(nh * r)
  return {
    width,
    height,
    x: Math.round((frameW - width) / 2),
    y: Math.round((frameH - height) / 2),
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function StitcherEditor() {
  const init = useMemo(() => makeInitialTiles(), [])
  const [tiles, setTiles] = useState<ProjectTile[]>(init.tiles)
  const [layers, setLayers] = useState<Layer[]>([])
  const [activeTileId, setActiveTileId] = useState(init.activeId)
  const fileInputId = useId()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const urlsRef = useRef(new Set<string>())

  const activeTile = useMemo(
    () => tiles.find((t) => t.id === activeTileId) ?? tiles[0],
    [tiles, activeTileId],
  )
  const editingTileId = activeTile?.id ?? ''

  const trackUrl = (url: string) => {
    urlsRef.current.add(url)
  }

  const revokeUrl = (url: string) => {
    if (urlsRef.current.has(url)) {
      URL.revokeObjectURL(url)
      urlsRef.current.delete(url)
    }
  }

  const updateActiveTile = useCallback(
    (patch: Partial<ProjectTile> | ((tile: ProjectTile) => ProjectTile)) => {
      if (!editingTileId) return
      setTiles((prev) =>
        prev.map((t) => {
          if (t.id !== editingTileId) return t
          return typeof patch === 'function' ? patch(t) : { ...t, ...patch }
        }),
      )
    },
    [editingTileId],
  )

  const frameW = activeTile?.frameW ?? 1080
  const frameH = activeTile?.frameH ?? 1350
  const sliceW = activeTile?.sliceW ?? 1080
  const sliceH = activeTile?.sliceH ?? 1350

  const { cols, rows } = useMemo(
    () => gridCounts(frameW, frameH, sliceW, sliceH),
    [frameW, frameH, sliceW, sliceH],
  )

  const onFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length || !activeTile || !editingTileId) return
      const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
      const ti = Math.max(0, tiles.findIndex((t) => t.id === editingTileId))
      const ox = tileOriginX(tiles, ti)

      for (const file of list) {
        const url = URL.createObjectURL(file)
        trackUrl(url)
        const layerId = crypto.randomUUID()
        const img = new Image()
        img.onload = () => {
          const fit = fitImageToFrame(img, activeTile.frameW, activeTile.frameH)
          setLayers((prev) => [
            ...prev,
            {
              id: layerId,
              name: file.name,
              url,
              image: img,
              x: ox + fit.x,
              y: fit.y,
              width: fit.width,
              height: fit.height,
            },
          ])
          setSelectedId(layerId)
        }
        img.onerror = () => {
          revokeUrl(url)
        }
        img.src = url
      }
    },
    [activeTile, editingTileId, tiles],
  )

  const onLayerGeometry = useCallback(
    (layerId: string, geo: Partial<Pick<Layer, 'x' | 'y' | 'width' | 'height'>>) => {
      setLayers((prev) =>
        prev.map((l) => (l.id === layerId ? { ...l, ...geo } : l)),
      )
    },
    [],
  )

  const handleSelectLayer = useCallback((id: string | null, tileId?: string | null) => {
    setSelectedId(id)
    if (tileId) setActiveTileId(tileId)
  }, [])

  const removeLayer = (id: string) => {
    setLayers((prev) =>
      prev.filter((l) => {
        if (l.id === id) revokeUrl(l.url)
        return l.id !== id
      }),
    )
    setSelectedId((cur) => (cur === id ? null : cur))
  }

  const moveLayer = (id: string, dir: -1 | 1) => {
    setLayers((prev) => {
      const i = prev.findIndex((l) => l.id === id)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(i, 1)
      next.splice(j, 0, item)
      return next
    })
  }

  const exportThisTile = async () => {
    if (!activeTile) return
    const idx = Math.max(0, tiles.findIndex((t) => t.id === activeTile.id))
    await downloadTileSlicesAsSeparatePngs(
      activeTile,
      idx,
      tiles,
      layers,
      downloadBlob,
    )
  }

  const exportAllTiles = async () => {
    const pack = await buildAllTilesExportZip(tiles, layers)
    if (pack) downloadBlob(pack.blob, pack.filename)
  }

  const addTile = () => {
    const ref = activeTile
    const label = `Tile ${tiles.length + 1}`
    const newTile: ProjectTile = {
      id: crypto.randomUUID(),
      label,
      frameW: ref?.frameW ?? 1080,
      frameH: ref?.frameH ?? 1350,
      sliceW: ref?.sliceW ?? 1080,
      sliceH: ref?.sliceH ?? 1350,
    }
    setTiles((prev) => [...prev, newTile])
    setActiveTileId(newTile.id)
    setSelectedId(null)
  }

  const removeTile = (id: string) => {
    if (tiles.length <= 1) return
    const tileIndex = tiles.findIndex((t) => t.id === id)
    if (tileIndex < 0) return
    const tile = tiles[tileIndex]!

    const ox = tileOriginX(tiles, tileIndex)
    const fw = tile.frameW

    setLayers((prev) => {
      const kept = prev.filter((l) => {
        const cx = l.x + l.width / 2
        const cy = l.y + l.height / 2
        const centerInRemoved =
          cx >= ox && cx < ox + fw && cy >= 0 && cy < tile.frameH
        if (centerInRemoved) {
          revokeUrl(l.url)
          return false
        }
        return true
      })
      return kept.map((l) => (l.x >= ox + fw ? { ...l, x: l.x - fw } : l))
    })

    const next = tiles.filter((t) => t.id !== id)
    setTiles(next)
    if (!next.some((t) => t.id === activeTileId)) {
      setActiveTileId(next[0]?.id ?? activeTileId)
    }
    setSelectedId(null)
  }

  const dim = (label: string, value: number, set: (n: number) => void) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={1}
        step={1}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => set(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
      />
    </label>
  )

  return (
    <div className="tool">
      <header className="tool-header">
        <div>
          <h1 className="tool-title">Carousel</h1>
          <p className="tool-sub">
            Tiles are flush in one row, with layers in world space so images can span frames. Export
            the active tile as individual PNG slices, or export every tile in a single ZIP of flat
            prefixed filenames.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn secondary" onClick={exportThisTile}>
            Export this tile (PNGs)
          </button>
          <button type="button" className="btn primary" onClick={exportAllTiles}>
            Export all tiles (one ZIP)
          </button>
        </div>
      </header>

      <div className="tool-body">
        <aside className="sidebar">
          <section className="panel">
            <h2>Tiles</h2>
            <p className="hint">
              Click a chip to set which frame new images land in. Drag layers freely across the row.
            </p>
            <div className="tile-chips" role="tablist" aria-label="Tiles">
              {tiles.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={t.id === activeTile?.id}
                  className={`tile-chip ${t.id === activeTile?.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTileId(t.id)
                    setSelectedId(null)
                  }}
                >
                  {t.label}
                </button>
              ))}
              <button type="button" className="tile-chip add" onClick={addTile} title="Add tile">
                + Add
              </button>
            </div>
            {activeTile ? (
              <>
                <label className="field tile-label-field">
                  <span>Tile name (used in export filenames)</span>
                  <input
                    type="text"
                    value={activeTile.label}
                    onChange={(e) =>
                      updateActiveTile({ label: e.target.value || 'Tile' })
                    }
                    maxLength={64}
                  />
                </label>
                {tiles.length > 1 ? (
                  <button
                    type="button"
                    className="btn danger-outline small-margin"
                    onClick={() => removeTile(activeTile.id)}
                  >
                    Remove this tile
                  </button>
                ) : null}
              </>
            ) : null}
          </section>

          <section className="panel">
            <h2>Frame</h2>
            <p className="hint">Composition size in pixels for the selected tile.</p>
            <div className="field-row">
              {dim('Width', frameW, (n) => updateActiveTile({ frameW: n }))}
              {dim('Height', frameH, (n) => updateActiveTile({ frameH: n }))}
            </div>
          </section>

          <section className="panel">
            <h2>Cell size</h2>
            <p className="hint">
              Each exported slice is this size. Guides show a {cols} × {rows} grid.
            </p>
            <div className="field-row">
              {dim('Width', sliceW, (n) => updateActiveTile({ sliceW: n }))}
              {dim('Height', sliceH, (n) => updateActiveTile({ sliceH: n }))}
            </div>
          </section>

          <section className="panel">
            <h2>Layers</h2>
            <p className="hint muted layer-hint-top">
              Shared across the row; position on canvas or use the list. Removing a tile deletes layers
              whose center falls in that frame and shifts the rest left.
            </p>
            <input
              id={fileInputId}
              type="file"
              accept="image/*"
              multiple
              className="visually-hidden"
              onChange={(e) => {
                onFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <label htmlFor={fileInputId} className="btn secondary file-label">
              Add images
            </label>

            <ul className="layer-list">
              {layers.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className={`layer-item ${selectedId === l.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedId(l.id)
                      const tid = tileIdForLayer(l, tiles)
                      if (tid) setActiveTileId(tid)
                    }}
                  >
                    <span className="layer-name">{l.name}</span>
                  </button>
                  <div className="layer-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Move down"
                      onClick={() => moveLayer(l.id, -1)}
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Move up"
                      onClick={() => moveLayer(l.id, 1)}
                    >
                      ▶
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="Remove"
                      onClick={() => removeLayer(l.id)}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {!layers.length ? (
              <p className="hint muted">No layers yet. Add images (they start in the active tile).</p>
            ) : null}
          </section>
        </aside>

        <main className="main">
          <MultiTileComposer
            tiles={tiles}
            layers={layers}
            selectedLayerId={selectedId}
            onSelectLayer={handleSelectLayer}
            onLayerGeometry={onLayerGeometry}
          />
          <p className="footer-hint">
            No gap between frames. Export this tile triggers one browser download per slice (with short
            pauses). Export all tiles delivers one <code>stitcher-export.zip</code> with all slice PNGs
            at the root (e.g. <code>tile-01-name_stitch_r1_c1.png</code>).
          </p>
        </main>
      </div>
    </div>
  )
}
