import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Transformer } from 'react-konva'
import Konva from 'konva'
import { gridCounts } from '../lib/exportTiles'
import { tileIdForLayer } from '../lib/rasterWorldTile'
import { totalTilesWidth } from '../lib/tileLayout'
import type { Layer as LayerModel, ProjectTile } from '../types'

function checkerPattern(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 16
  const g = c.getContext('2d')
  if (!g) return c
  g.fillStyle = '#f0f0f0'
  g.fillRect(0, 0, 16, 16)
  g.fillStyle = '#e2e2e2'
  g.fillRect(0, 0, 8, 8)
  g.fillRect(8, 8, 8, 8)
  return c
}

let checker: HTMLCanvasElement | null = null
function getChecker() {
  if (!checker) checker = checkerPattern()
  return checker
}

export type LayerGeometry = {
  x: number
  y: number
  width: number
  height: number
}

export type MultiTileComposerProps = {
  tiles: ProjectTile[]
  layers: LayerModel[]
  selectedLayerId: string | null
  onSelectLayer: (layerId: string | null, tileId?: string | null) => void
  onLayerGeometry: (layerId: string, geo: Partial<LayerGeometry>) => void
}

type TileLayout = {
  tile: ProjectTile
  offsetX: number
}

function buildLayouts(tiles: ProjectTile[]): TileLayout[] {
  let x = 0
  return tiles.map((tile) => {
    const offsetX = x
    x += tile.frameW
    return { tile, offsetX }
  })
}

export function MultiTileComposer({
  tiles,
  layers,
  selectedLayerId,
  onSelectLayer,
  onLayerGeometry,
}: MultiTileComposerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [viewport, setViewport] = useState({ w: 800, h: 500 })

  const layouts = useMemo(() => buildLayouts(tiles), [tiles])

  const maxFrameH = useMemo(
    () => (tiles.length ? Math.max(...tiles.map((t) => t.frameH)) : 1),
    [tiles],
  )

  const totalW = useMemo(() => Math.max(1, totalTilesWidth(tiles)), [tiles])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setViewport({ w: Math.max(200, r.width), h: Math.max(200, r.height) })
    })
    ro.observe(el)
    const r = el.getBoundingClientRect()
    setViewport({ w: Math.max(200, r.width), h: Math.max(200, r.height) })
    return () => ro.disconnect()
  }, [])

  const scale = useMemo(() => {
    const padX = 32
    const padY = 32
    const sx = (viewport.w - padX) / Math.max(1, totalW)
    const sy = (viewport.h - padY) / Math.max(1, maxFrameH)
    return Math.min(sx, sy, 1)
  }, [viewport, totalW, maxFrameH])

  const stageW = Math.max(1, Math.round(totalW * scale))
  const stageH = Math.max(1, Math.round(maxFrameH * scale))

  const handleBackgroundPointer = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.target.getClassName() === 'Image') return
      let n: Konva.Node | null = e.target
      while (n) {
        if (n.getClassName() === 'Transformer') return
        n = n.getParent()
      }
      onSelectLayer(null)
    },
    [onSelectLayer],
  )

  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const stage = tr.getStage()
    if (!stage) return
    const selected = selectedLayerId
      ? (stage.findOne(`#layer-${selectedLayerId}`) as Konva.Image | undefined)
      : undefined
    tr.nodes(selected ? [selected] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedLayerId, tiles, layers, scale, layouts])

  const finishImageDrag = useCallback(
    (layerId: string, node: Konva.Image) => {
      const w = node.width() * node.scaleX()
      const h = node.height() * node.scaleY()
      node.scaleX(1)
      node.scaleY(1)
      onLayerGeometry(layerId, {
        x: node.x(),
        y: node.y(),
        width: w,
        height: h,
      })
    },
    [onLayerGeometry],
  )

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 280,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--panel, rgba(0,0,0,0.03))',
        borderRadius: 12,
        border: '1px solid var(--border)',
        overflow: 'auto',
      }}
    >
      <Stage width={stageW} height={stageH}>
        <Layer>
          <Group
            scaleX={scale}
            scaleY={scale}
            onMouseDown={handleBackgroundPointer}
            onTouchStart={handleBackgroundPointer}
          >
            {layouts.map(({ tile, offsetX }) => (
              <Group key={`${tile.id}-bg`} x={offsetX} y={0}>
                <Rect
                  x={0}
                  y={0}
                  width={tile.frameW}
                  height={tile.frameH}
                  fillPatternImage={getChecker() as unknown as HTMLImageElement}
                  fillPatternRepeat="repeat"
                  listening={false}
                />
              </Group>
            ))}
            <Group key="world-layers">
              {layers.map((layer) =>
                layer.image ? (
                  <KonvaImage
                    key={layer.id}
                    id={`layer-${layer.id}`}
                    image={layer.image}
                    x={layer.x}
                    y={layer.y}
                    width={layer.width}
                    height={layer.height}
                    draggable
                    onMouseDown={(e) => {
                      e.cancelBubble = true
                    }}
                    onTouchStart={(e) => {
                      e.cancelBubble = true
                    }}
                    onClick={(e) => {
                      e.cancelBubble = true
                      const tid = tileIdForLayer(layer, tiles)
                      onSelectLayer(layer.id, tid ?? undefined)
                    }}
                    onTap={(e) => {
                      e.cancelBubble = true
                      const tid = tileIdForLayer(layer, tiles)
                      onSelectLayer(layer.id, tid ?? undefined)
                    }}
                    onDragEnd={(e) => {
                      finishImageDrag(layer.id, e.target as Konva.Image)
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target
                      const sx = node.scaleX()
                      const sy = node.scaleY()
                      node.scaleX(1)
                      node.scaleY(1)
                      onLayerGeometry(layer.id, {
                        x: node.x(),
                        y: node.y(),
                        width: Math.max(8, node.width() * sx),
                        height: Math.max(8, node.height() * sy),
                      })
                    }}
                  />
                ) : null,
              )}
            </Group>
            {layouts.map(({ tile, offsetX }) => {
              const { cols, rows } = gridCounts(
                tile.frameW,
                tile.frameH,
                tile.sliceW,
                tile.sliceH,
              )
              const guides: { points: number[]; key: string }[] = []
              for (let c = 1; c < cols; c++) {
                const x = c * tile.sliceW
                guides.push({ key: `${tile.id}-v-${c}`, points: [x, 0, x, tile.frameH] })
              }
              for (let r = 1; r < rows; r++) {
                const y = r * tile.sliceH
                guides.push({ key: `${tile.id}-h-${r}`, points: [0, y, tile.frameW, y] })
              }
              return (
                <Group key={`${tile.id}-chrome`} x={offsetX} y={0}>
                  {guides.map((g) => (
                    <Line
                      key={g.key}
                      points={g.points}
                      stroke="var(--accent, #aa3bff)"
                      strokeWidth={1 / scale}
                      dash={[6 / scale, 4 / scale]}
                      listening={false}
                      opacity={0.85}
                    />
                  ))}
                  <Rect
                    x={0}
                    y={0}
                    width={tile.frameW}
                    height={tile.frameH}
                    stroke="var(--text-h)"
                    strokeWidth={2 / scale}
                    listening={false}
                  />
                </Group>
              )
            })}
            <Transformer
              ref={trRef}
              rotateEnabled={false}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 12 || newBox.height < 12) return oldBox
                return newBox
              }}
            />
          </Group>
        </Layer>
      </Stage>
    </div>
  )
}
