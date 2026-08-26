import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { MultiTileComposer } from './multi-tile-composer'
import { gridCounts } from '../lib/export-tiles'
import { CAROUSEL_PRESETS, matchingPreset } from '../lib/platform-presets'
import { tileIdForLayer } from '../lib/raster-world-tile'
import { coverImageInBox, makeSplitTiles } from '../lib/split-panorama'
import { tileOriginX } from '../lib/tile-layout'
import {
  buildAllTilesExportZip,
  downloadTileSlicesAsSeparatePngs,
} from '../lib/tile-export-zip'
import { useEditorHistory, type EditorSnapshot } from '../lib/use-editor-history'
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

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function StitcherEditor() {
  const init = useMemo(() => makeInitialTiles(), [])
  const [tiles, setTiles] = useState<ProjectTile[]>(init.tiles)
  const [layers, setLayers] = useState<Layer[]>([])
  const [activeTileId, setActiveTileId] = useState(init.activeId)
  const fileInputId = useId()
  const splitInputId = useId()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [splitCount, setSplitCount] = useState(3)
  const urlsRef = useRef(new Set<string>())
  const { push, undo: popUndo, redo: popRedo, canUndo, canRedo } = useEditorHistory()

  const stateRef = useRef<EditorSnapshot>({
    tiles,
    layers,
    activeTileId,
    selectedId,
  })
  stateRef.current = { tiles, layers, activeTileId, selectedId }

  const withHistory = useCallback(
    (fn: () => void) => {
      push(stateRef.current)
      fn()
    },
    [push],
  )

  const applySnapshot = useCallback((snap: EditorSnapshot) => {
    setTiles(snap.tiles)
    setLayers(snap.layers)
    setActiveTileId(snap.activeTileId)
    setSelectedId(snap.selectedId)
  }, [])

  const undo = useCallback(() => {
    const prev = popUndo(stateRef.current)
    if (prev) applySnapshot(prev)
  }, [popUndo, applySnapshot])

  const redo = useCallback(() => {
    const next = popRedo(stateRef.current)
    if (next) applySnapshot(next)
  }, [popRedo, applySnapshot])

  const activeTile = useMemo(
    () => tiles.find((t) => t.id === activeTileId) ?? tiles[0],
    [tiles, activeTileId],
  )
  const editingTileId = activeTile?.id ?? ''
  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedId) ?? null,
    [layers, selectedId],
  )

  const trackUrl = (url: string) => {
    urlsRef.current.add(url)
  }

  const revokeUrl = (url: string) => {
    if (urlsRef.current.has(url)) {
      URL.revokeObjectURL(url)
      urlsRef.current.delete(url)
    }
  }

  useEffect(() => {
    return () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url)
      urlsRef.current.clear()
    }
  }, [])

  const updateActiveTile = useCallback(
    (patch: Partial<ProjectTile> | ((tile: ProjectTile) => ProjectTile)) => {
      if (!editingTileId) return
      withHistory(() => {
        setTiles((prev) =>
          prev.map((t) => {
            if (t.id !== editingTileId) return t
            return typeof patch === 'function' ? patch(t) : { ...t, ...patch }
          }),
        )
      })
    },
    [editingTileId, withHistory],
  )

  const applyPreset = (width: number, height: number) => {
    withHistory(() => {
      setTiles((prev) =>
        prev.map((t) => ({
          ...t,
          frameW: width,
          frameH: height,
          sliceW: width,
          sliceH: height,
        })),
      )
    })
  }

  const frameW = activeTile?.frameW ?? 1080
  const frameH = activeTile?.frameH ?? 1350
  const sliceW = activeTile?.sliceW ?? 1080
  const sliceH = activeTile?.sliceH ?? 1350
  const activePreset = matchingPreset(frameW, frameH)

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
          withHistory(() => {
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
                lockAspect: true,
              },
            ])
            setSelectedId(layerId)
          })
        }
        img.onerror = () => {
          revokeUrl(url)
        }
        img.src = url
      }
    },
    [activeTile, editingTileId, tiles, withHistory],
  )

  const onSplitFile = (files: FileList | null) => {
    const file = files?.[0]
    if (!file || !file.type.startsWith('image/') || !activeTile) return
    const url = URL.createObjectURL(file)
    trackUrl(url)
    const img = new Image()
    img.onload = () => {
      const newTiles = makeSplitTiles(splitCount, activeTile.frameW, activeTile.frameH)
      const totalW = newTiles.reduce((s, t) => s + t.frameW, 0)
      const cover = coverImageInBox(
        img.naturalWidth || img.width,
        img.naturalHeight || img.height,
        totalW,
        activeTile.frameH,
      )
      const layerId = crypto.randomUUID()
      withHistory(() => {
        setTiles(newTiles)
        setLayers([
          {
            id: layerId,
            name: file.name,
            url,
            image: img,
            x: cover.x,
            y: cover.y,
            width: cover.width,
            height: cover.height,
            lockAspect: true,
          },
        ])
        setActiveTileId(newTiles[0]!.id)
        setSelectedId(layerId)
      })
    }
    img.onerror = () => {
      revokeUrl(url)
    }
    img.src = url
  }

  const onLayerGeometry = useCallback(
    (layerId: string, geo: Partial<Pick<Layer, 'x' | 'y' | 'width' | 'height'>>) => {
      withHistory(() => {
        setLayers((prev) =>
          prev.map((l) => (l.id === layerId ? { ...l, ...geo } : l)),
        )
      })
    },
    [withHistory],
  )

  const handleSelectLayer = useCallback((id: string | null, tileId?: string | null) => {
    setSelectedId(id)
    if (tileId) setActiveTileId(tileId)
  }, [])

  const removeLayer = useCallback(
    (id: string) => {
      withHistory(() => {
        setLayers((prev) => prev.filter((l) => l.id !== id))
        setSelectedId((cur) => (cur === id ? null : cur))
      })
    },
    [withHistory],
  )

  const moveLayer = (id: string, dir: -1 | 1) => {
    withHistory(() => {
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
    })
  }

  const setLockAspect = (id: string, lockAspect: boolean) => {
    withHistory(() => {
      setLayers((prev) =>
        prev.map((l) => (l.id === id ? { ...l, lockAspect } : l)),
      )
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
    withHistory(() => {
      setTiles((prev) => [...prev, newTile])
      setActiveTileId(newTile.id)
      setSelectedId(null)
    })
  }

  const removeTile = (id: string) => {
    if (tiles.length <= 1) return
    const tileIndex = tiles.findIndex((t) => t.id === id)
    if (tileIndex < 0) return
    const tile = tiles[tileIndex]!

    const ox = tileOriginX(tiles, tileIndex)
    const fw = tile.frameW

    withHistory(() => {
      setLayers((prev) => {
        const kept = prev.filter((l) => {
          const cx = l.x + l.width / 2
          const cy = l.y + l.height / 2
          const centerInRemoved =
            cx >= ox && cx < ox + fw && cy >= 0 && cy < tile.frameH
          return !centerInRemoved
        })
        return kept.map((l) => (l.x >= ox + fw ? { ...l, x: l.x - fw } : l))
      })

      const next = tiles.filter((t) => t.id !== id)
      setTiles(next)
      if (!next.some((t) => t.id === activeTileId)) {
        setActiveTileId(next[0]?.id ?? activeTileId)
      }
      setSelectedId(null)
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        removeLayer(selectedId)
        return
      }
      if (
        selectedId &&
        (e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight' ||
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown')
      ) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx =
          e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        withHistory(() => {
          setLayers((prev) =>
            prev.map((l) =>
              l.id === selectedId ? { ...l, x: l.x + dx, y: l.y + dy } : l,
            ),
          )
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, selectedId, removeLayer, withHistory])

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
          <button
            type="button"
            className="btn secondary"
            onClick={undo}
            disabled={!canUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={redo}
            disabled={!canRedo}
          >
            Redo
          </button>
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
              Images snap to tile edges, centers, and slice guides.
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
            <h2>Split image</h2>
            <p className="hint">
              Cover one photo across a new row of tiles (replaces the current tiles).
            </p>
            <label className="field">
              <span>Number of tiles</span>
              <input
                type="number"
                min={2}
                max={10}
                step={1}
                value={splitCount}
                onChange={(e) =>
                  setSplitCount(
                    Math.max(2, Math.min(10, Math.floor(Number(e.target.value) || 2))),
                  )
                }
              />
            </label>
            <input
              id={splitInputId}
              type="file"
              accept="image/*"
              className="visually-hidden"
              onChange={(e) => {
                onSplitFile(e.target.files)
                e.target.value = ''
              }}
            />
            <label htmlFor={splitInputId} className="btn secondary file-label small-margin">
              Split image into carousel
            </label>
          </section>

          <section className="panel">
            <h2>Frame</h2>
            <p className="hint">Composition size in pixels. Presets apply to every tile.</p>
            <div className="preset-chips" role="group" aria-label="Frame presets">
              {CAROUSEL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`tile-chip ${activePreset?.id === p.id ? 'active' : ''}`}
                  onClick={() => applyPreset(p.width, p.height)}
                >
                  {p.label}
                </button>
              ))}
            </div>
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
              Shared across the row. Undo with Ctrl/Cmd+Z. Arrow keys nudge the selected layer.
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

            {selectedLayer ? (
              <label className="check-row small-margin">
                <input
                  type="checkbox"
                  checked={selectedLayer.lockAspect}
                  onChange={(e) => setLockAspect(selectedLayer.id, e.target.checked)}
                />
                <span>Lock aspect ratio</span>
              </label>
            ) : null}

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
            lockAspect={selectedLayer?.lockAspect ?? true}
            onSelectLayer={handleSelectLayer}
            onLayerGeometry={onLayerGeometry}
          />
          <p className="footer-hint">
            No gap between frames. Green lines appear when a layer snaps. Export all tiles delivers one{' '}
            <code>stitcher-export.zip</code> with all slice PNGs at the root.
          </p>
        </main>
      </div>
    </div>
  )
}
