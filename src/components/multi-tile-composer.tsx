import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Transformer } from 'react-konva'
import Konva from 'konva'
import { gridCounts } from '../lib/export-tiles'
import { tileIdForLayer } from '../lib/raster-world-tile'
import { collectSnapTargets, snapBox, type SnapGuides } from '../lib/snap-guides'
import { totalTilesWidth } from '../lib/tile-layout'
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
  lockAspect: boolean
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

const RESIZE_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-right',
  'middle-left',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

export function MultiTileComposer({
  tiles,
  layers,
  selectedLayerId,
  lockAspect,
  onSelectLayer,
  onLayerGeometry,
}: MultiTileComposerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [viewport, setViewport] = useState({ w: 800, h: 500 })
  const [guides, setGuides] = useState<SnapGuides>({ v: [], h: [] })

  const layouts = useMemo(() => buildLayouts(tiles), [tiles])
  const snapTargets = useMemo(() => collectSnapTargets(tiles), [tiles])

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
  const snapThreshold = 8 / Math.max(scale, 0.05)

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
  }, [selectedLayerId, tiles, layers, scale, layouts, lockAspect])

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
      setGuides({ v: [], h: [] })
    },
    [onLayerGeometry],
  )

  const snapNode = useCallback(
    (node: Konva.Node) => {
      const w = Math.abs(node.width() * node.scaleX())
      const h = Math.abs(node.height() * node.scaleY())
      const snapped = snapBox(
        { x: node.x(), y: node.y(), width: w, height: h },
        snapTargets.xs,
        snapTargets.ys,
        snapThreshold,
      )
      node.x(snapped.x)
      node.y(snapped.y)
      setGuides(snapped.guides)
    },
    [snapTargets, snapThreshold],
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
                    onDragMove={(e) => {
                      snapNode(e.target)
                    }}
                    onDragEnd={(e) => {
                      finishImageDrag(layer.id, e.target as Konva.Image)
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target
                      snapNode(node)
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
                      setGuides({ v: [], h: [] })
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
              const lines: { points: number[]; key: string }[] = []
              for (let c = 1; c < cols; c++) {
                const x = c * tile.sliceW
                lines.push({ key: `${tile.id}-v-${c}`, points: [x, 0, x, tile.frameH] })
              }
              for (let r = 1; r < rows; r++) {
                const y = r * tile.sliceH
                lines.push({ key: `${tile.id}-h-${r}`, points: [0, y, tile.frameW, y] })
              }
              return (
                <Group key={`${tile.id}-chrome`} x={offsetX} y={0}>
                  {lines.map((g) => (
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
            {guides.v.map((x) => (
              <Line
                key={`snap-v-${x}`}
                points={[x, 0, x, maxFrameH]}
                stroke="#22c55e"
                strokeWidth={2 / scale}
                listening={false}
              />
            ))}
            {guides.h.map((y) => (
              <Line
                key={`snap-h-${y}`}
                points={[0, y, totalW, y]}
                stroke="#22c55e"
                strokeWidth={2 / scale}
                listening={false}
              />
            ))}
            <Transformer
              ref={trRef}
              rotateEnabled={false}
              keepRatio={lockAspect}
              enabledAnchors={RESIZE_ANCHORS}
              boundBoxFunc={(oldBox, newBox) => {
                if (Math.abs(newBox.width) < 12 || Math.abs(newBox.height) < 12) {
                  return oldBox
                }
                if (!lockAspect) return newBox

                // Side anchors ignore Konva keepRatio — enforce aspect here.
                const absOldW = Math.abs(oldBox.width)
                const absOldH = Math.abs(oldBox.height)
                if (absOldW < 1 || absOldH < 1) return newBox
                const ratio = absOldW / absOldH

                const dw = Math.abs(Math.abs(newBox.width) - absOldW)
                const dh = Math.abs(Math.abs(newBox.height) - absOldH)

                if (dw >= dh) {
                  const signH = newBox.height < 0 ? -1 : 1
                  const newAbsH = Math.abs(newBox.width) / ratio
                  const centerY = oldBox.y + oldBox.height / 2
                  return {
                    ...newBox,
                    height: newAbsH * signH,
                    y: centerY - (newAbsH * signH) / 2,
                  }
                }

                const signW = newBox.width < 0 ? -1 : 1
                const newAbsW = Math.abs(newBox.height) * ratio
                const centerX = oldBox.x + oldBox.width / 2
                return {
                  ...newBox,
                  width: newAbsW * signW,
                  x: centerX - (newAbsW * signW) / 2,
                }
              }}
            />
          </Group>
        </Layer>
      </Stage>
    </div>
  )
}
